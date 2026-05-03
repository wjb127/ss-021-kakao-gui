// 로컬 파일을 macOS 기본 앱으로 열기
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { path?: string };
    const filePath = body.path?.trim();
    if (!filePath) {
      return NextResponse.json({ error: "path 가 필요함" }, { status: 400 });
    }

    // 절대경로 + 정규화 (../ 같은 상대 경로 방지)
    const resolved = path.resolve(filePath);
    if (resolved !== filePath && !path.isAbsolute(filePath)) {
      return NextResponse.json(
        { error: "절대경로만 허용" },
        { status: 400 },
      );
    }

    if (!existsSync(resolved)) {
      return NextResponse.json(
        { error: "파일이 없음 (앱에서 다운로드 안 됐을 수 있음)" },
        { status: 404 },
      );
    }

    // macOS `open` 은 기본 앱으로 파일 실행. shell 미사용 → 인젝션 안전
    await execFileAsync("/usr/bin/open", [resolved]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("open-file 실패:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// 폴더에서 파일 표시 (Finder reveal)
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { path?: string };
    const filePath = body.path?.trim();
    if (!filePath) {
      return NextResponse.json({ error: "path 가 필요함" }, { status: 400 });
    }
    const resolved = path.resolve(filePath);
    if (!existsSync(resolved)) {
      return NextResponse.json({ error: "파일이 없음" }, { status: 404 });
    }
    await execFileAsync("/usr/bin/open", ["-R", resolved]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reveal-file 실패:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
