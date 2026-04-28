// KAKAO_CONTEXT.md 생성/저장 로직 공통 헬퍼
// save-context route + claude-trigger route 양쪽에서 사용

import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getCachedMessages, getTodoForChat, getMemo } from "./store";
import type { Message } from "./types";

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${mm}-${dd} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

function toPhotoFilename(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `photo_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
  } catch { return "photo.jpg"; }
}

function messagesToText(messages: Message[]): string {
  return messages
    .filter((m) => m.type !== "system" && (m.text?.trim() || m.type === "photo"))
    .map((m) => {
      const who = m.is_from_me ? "나" : `상대(${m.sender_id.slice(-4)})`;
      const text = m.type === "photo" ? `[사진: ${toPhotoFilename(m.timestamp)}]` : m.text;
      return `[${formatTimestamp(m.timestamp)}] ${who}: ${text}`;
    })
    .join("\n");
}

function nowKST(): string {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export async function buildContextMarkdown(
  chatId: string,
  displayName: string,
): Promise<string> {
  const messages = getCachedMessages(chatId);
  const analysis = await getTodoForChat(chatId);
  const memo = getMemo(chatId);

  const lines: string[] = [];
  lines.push(`# 카카오 컨텍스트: ${displayName}`);
  lines.push(`업데이트: ${nowKST()}`);
  lines.push("");

  if (memo?.trim()) {
    lines.push("## 고객 메모");
    lines.push(memo.trim());
    lines.push("");
  }

  if (messages.length > 0) {
    lines.push("## 최근 대화");
    lines.push(messagesToText(messages));
    lines.push("");
  } else {
    lines.push("## 최근 대화");
    lines.push("(캐시된 메시지 없음)");
    lines.push("");
  }

  if (analysis) {
    lines.push("## AI 분석");
    lines.push(`요약: ${analysis.summary}`);
    lines.push(`긴급도: ${analysis.urgency}`);
    if (analysis.nextAction) {
      lines.push(`다음 액션: ${analysis.nextAction}`);
    }
    if (analysis.todos.length > 0) {
      lines.push("TODO:");
      for (const t of analysis.todos) {
        lines.push(`- ${t}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function saveContextFile(
  chatId: string,
  displayName: string,
  projectPath: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!existsSync(projectPath)) {
    return { ok: false, error: `경로 없음: ${projectPath}` };
  }
  const md = await buildContextMarkdown(chatId, displayName);
  const outPath = path.join(projectPath, "KAKAO_CONTEXT.md");
  writeFileSync(outPath, md, "utf-8");
  return { ok: true, path: outPath };
}
