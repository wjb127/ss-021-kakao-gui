import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getCachedMessages, getMemo } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Candidate {
  projectPath: string;
  name: string;
  text: string;
  gitMtime: number;
}

interface Suggestion {
  projectPath: string;
  name: string;
  score: number;
  confidence: number;
  reason: string;
  matchedTerms: string[];
  signals: string[];
}

const DEFAULT_ROOTS = [
  path.join(/*turbopackIgnore: true*/ os.homedir(), "Project"),
  path.join(/*turbopackIgnore: true*/ os.homedir(), "Project", "customer-projects"),
];

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "artifacts",
]);

const TEXT_FILES = [
  "package.json",
  "README.md",
  "readme.md",
  "prd.md",
  "PRD.md",
  "KAKAO_CONTEXT.md",
  path.join(/*turbopackIgnore: true*/ "memory", "README.md"),
];

const MAX_ROOT_ENTRIES = 220;
const MAX_CANDIDATES = 260;
const MAX_FILE_CHARS = 80_000;
const MAX_MESSAGE_CHARS = 36_000;
const STOP_TERMS = new Set([
  "admin",
  "analytics",
  "analytics.google.com",
  "cloudflare",
  "dash.cloudflare.com",
  "dev",
  "google",
  "google.com",
  "https",
  "naver",
  "naver.com",
  "preview",
  "seungbeen",
  "seungbeen-dev",
  "workers",
  "workers.dev",
  "www",
]);

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._:/~@-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSlug(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9가-힣一-龥ぁ-んァ-ン]+/u)
    .map((v) => v.trim())
    .filter((v) => v.length >= 2);
}

function extractTerms(input: string): string[] {
  const normalized = normalizeText(input);
  const terms = new Map<string, number>();

  const add = (term: string, weight = 1) => {
    const t = term.toLowerCase().trim();
    if (t.length < 2 || t.length > 80) return;
    if (STOP_TERMS.has(t)) return;
    terms.set(t, Math.max(terms.get(t) ?? 0, weight));
  };

  for (const match of normalized.matchAll(/https?:\/\/([a-z0-9.-]+)(\/[a-z0-9._~:/?#[\]@!$&'()*+,;=-]*)?/g)) {
    add(match[1], 8);
    for (const part of splitSlug(match[1])) add(part, part.length >= 5 ? 5 : 2);
    if (match[2]) {
      for (const part of splitSlug(match[2])) add(part, part.length >= 5 ? 4 : 1);
    }
  }

  for (const match of normalized.matchAll(/\b(?:km|ss)-\d{2,4}-[a-z0-9-]+\b/g)) {
    add(match[0], 10);
    for (const part of splitSlug(match[0])) add(part, part.length >= 4 ? 4 : 1);
  }

  for (const match of normalized.matchAll(/\b[a-z0-9][a-z0-9-]{4,}\.(?:com|net|kr|dev|app|co\.kr)\b/g)) {
    add(match[0], 8);
    for (const part of splitSlug(match[0])) add(part, part.length >= 5 ? 5 : 2);
  }

  for (const raw of normalized.split(" ")) {
    const value = raw.trim();
    if (value.length < 2) continue;
    if (/^\d+$/.test(value)) continue;
    if (/^[ㄱ-ㅎㅏ-ㅣ]+$/u.test(value)) continue;
    if (value.length >= 3 && value.length <= 32) add(value, value.length >= 5 ? 2 : 1);
  }

  return [...terms.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 80)
    .map(([term]) => term);
}

async function readSmallText(filePath: string): Promise<string> {
  try {
    const s = await stat(filePath);
    if (!s.isFile() || s.size > 1_000_000) return "";
    const text = await readFile(filePath, "utf8");
    return text.slice(0, MAX_FILE_CHARS);
  } catch {
    return "";
  }
}

async function readCandidateText(projectPath: string): Promise<string> {
  const chunks: string[] = [];
  for (const rel of TEXT_FILES) {
    const text = await readSmallText(path.join(/*turbopackIgnore: true*/ projectPath, rel));
    if (text) chunks.push(text);
  }
  return chunks.join("\n");
}

async function getGitMtime(projectPath: string): Promise<number> {
  try {
    const s = await stat(path.join(/*turbopackIgnore: true*/ projectPath, ".git"));
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

async function isProjectDir(dirPath: string): Promise<boolean> {
  if (existsSync(path.join(/*turbopackIgnore: true*/ dirPath, "package.json"))) return true;
  if (existsSync(path.join(/*turbopackIgnore: true*/ dirPath, ".git"))) return true;
  if (existsSync(path.join(/*turbopackIgnore: true*/ dirPath, "KAKAO_CONTEXT.md"))) return true;
  if (existsSync(path.join(/*turbopackIgnore: true*/ dirPath, "wrangler.toml"))) return true;
  if (existsSync(path.join(/*turbopackIgnore: true*/ dirPath, "next.config.ts"))) return true;
  if (existsSync(path.join(/*turbopackIgnore: true*/ dirPath, "next.config.js"))) return true;
  return false;
}

async function listProjectDirs(root: string): Promise<string[]> {
  const found: string[] = [];

  async function visit(dirPath: string, depth: number) {
    if (found.length >= MAX_CANDIDATES || depth > 2) return;
    const base = path.basename(dirPath);
    if (SKIP_DIRS.has(base)) return;

    if (depth > 0 && await isProjectDir(dirPath)) {
      found.push(dirPath);
      return;
    }

    let entries: { name: string; isDirectory: () => boolean }[];
    try {
      entries = (await readdir(dirPath, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .slice(0, MAX_ROOT_ENTRIES);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await visit(path.join(/*turbopackIgnore: true*/ dirPath, entry.name), depth + 1);
      if (found.length >= MAX_CANDIDATES) return;
    }
  }

  await visit(root, 0);
  return found;
}

async function loadCandidates(): Promise<Candidate[]> {
  const roots = (process.env.KAKAO_PROJECT_ROOTS?.split(":") ?? DEFAULT_ROOTS)
    .map((root) => root.trim())
    .filter(Boolean);
  const projectPaths = new Set<string>();

  for (const root of roots) {
    const resolved = path.resolve(root);
    if (!existsSync(resolved)) continue;
    for (const projectPath of await listProjectDirs(resolved)) {
      projectPaths.add(projectPath);
    }
  }

  const candidates: Candidate[] = [];
  for (const projectPath of [...projectPaths].slice(0, MAX_CANDIDATES)) {
    const name = path.basename(projectPath);
    const text = `${name}\n${await readCandidateText(projectPath)}`;
    candidates.push({
      projectPath,
      name,
      text: normalizeText(text),
      gitMtime: await getGitMtime(projectPath),
    });
  }
  return candidates;
}

function scoreCandidate(candidate: Candidate, terms: string[]): Suggestion | null {
  const nameText = normalizeText(candidate.name);
  const matchedTerms: string[] = [];
  const signals: string[] = [];
  let score = 0;

  for (const term of terms) {
    if (nameText === term) {
      score += 80;
      matchedTerms.push(term);
      signals.push("폴더명 정확히 일치");
      continue;
    }
    if (nameText.includes(term)) {
      score += term.length >= 8 ? 45 : 22;
      matchedTerms.push(term);
      signals.push("폴더명 포함");
      continue;
    }
    if (candidate.text.includes(term)) {
      score += term.length >= 8 ? 22 : 8;
      matchedTerms.push(term);
      signals.push("프로젝트 문서 포함");
    }
  }

  const uniqueTerms = [...new Set(matchedTerms)].slice(0, 12);
  if (uniqueTerms.length === 0) return null;

  const recencyBoost = candidate.gitMtime
    ? Math.max(0, 12 - Math.floor((Date.now() - candidate.gitMtime) / (1000 * 60 * 60 * 24 * 14)))
    : 0;
  score += recencyBoost;
  if (recencyBoost > 0) signals.push("최근 프로젝트");

  const confidence = Math.max(15, Math.min(99, Math.round(score)));
  if (score < 50) return null;
  const reason = uniqueTerms.slice(0, 5).join(", ");
  return {
    projectPath: candidate.projectPath,
    name: candidate.name,
    score,
    confidence,
    reason: reason ? `대화 키워드 매칭: ${reason}` : "대화 내용과 경로가 유사함",
    matchedTerms: uniqueTerms,
    signals: [...new Set(signals)].slice(0, 4),
  };
}

export async function POST(req: NextRequest) {
  const { chatId, displayName } = (await req.json()) as {
    chatId?: string;
    displayName?: string;
  };

  if (!chatId) {
    return NextResponse.json({ error: "chatId required" }, { status: 400 });
  }

  const messages = getCachedMessages(chatId)
    .filter((message) => !message.is_deleted)
    .slice(-260)
    .map((message) => message.text)
    .join("\n")
    .slice(-MAX_MESSAGE_CHARS);
  const memo = getMemo(chatId);
  const sourceText = [displayName ?? "", memo, messages].filter(Boolean).join("\n");
  const queryTerms = extractTerms(sourceText);

  if (queryTerms.length === 0) {
    return NextResponse.json({
      suggestions: [],
      scanned: 0,
      queryTerms: [],
      error: "추천에 쓸 대화 키워드가 부족함",
    });
  }

  const candidates = await loadCandidates();
  const suggestions = candidates
    .map((candidate) => scoreCandidate(candidate, queryTerms))
    .filter((value): value is Suggestion => value !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return NextResponse.json({
    suggestions,
    scanned: candidates.length,
    queryTerms: queryTerms.slice(0, 30),
  });
}
