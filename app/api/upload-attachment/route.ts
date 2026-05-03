// 카톡 첨부 파일(사진/PDF) 프로젝트 폴더로 주입
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { getProjectPaths } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".pdf"];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function safeName(original: string): string {
  // 경로 분리자 제거, 영숫자+한글+점+하이픈+언더스코어만 허용
  const base = path.basename(original);
  return base.replace(/[^\w가-힣.\-]/g, "_");
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const chatId = form.get("chatId");
  const projectPath = form.get("projectPath");

  if (typeof chatId !== "string" || typeof projectPath !== "string") {
    return NextResponse.json({ error: "chatId, projectPath required" }, { status: 400 });
  }

  // 등록된 경로인지 검증 (임의 경로 쓰기 방지)
  const allowed = getProjectPaths(chatId);
  if (!allowed.includes(projectPath)) {
    return NextResponse.json({ error: "등록되지 않은 projectPath" }, { status: 403 });
  }

  // 절대경로 정규화 + 디렉토리 존재 확인
  const absRoot = path.resolve(projectPath);
  try {
    const stat = await fs.stat(absRoot);
    if (!stat.isDirectory()) throw new Error("not dir");
  } catch {
    return NextResponse.json({ error: "프로젝트 디렉토리 없음" }, { status: 400 });
  }

  const targetDir = path.join(absRoot, "kakao_attachments");
  await fs.mkdir(targetDir, { recursive: true });

  const files = form.getAll("files");
  if (files.length === 0) {
    return NextResponse.json({ error: "파일 없음" }, { status: 400 });
  }

  const saved: string[] = [];
  const errors: string[] = [];

  for (const f of files) {
    if (!(f instanceof File)) continue;
    const ext = path.extname(f.name).toLowerCase();
    if (!ALLOWED_EXT.includes(ext) && !ALLOWED_MIME.includes(f.type)) {
      errors.push(`${f.name}: 허용되지 않는 형식`);
      continue;
    }
    if (f.size > MAX_FILE_SIZE) {
      errors.push(`${f.name}: 50MB 초과`);
      continue;
    }

    const buf = Buffer.from(await f.arrayBuffer());
    const cleanName = safeName(f.name);
    // 동일 파일명 충돌 방지: 타임스탬프 prefix
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const finalName = `${ts}_${cleanName}`;
    const finalPath = path.join(targetDir, finalName);

    // path traversal 방지: targetDir 하위인지 재확인
    if (!finalPath.startsWith(targetDir + path.sep)) {
      errors.push(`${f.name}: 잘못된 경로`);
      continue;
    }

    await fs.writeFile(finalPath, buf);
    saved.push(finalName);
  }

  return NextResponse.json({
    saved,
    errors,
    targetDir,
  });
}
