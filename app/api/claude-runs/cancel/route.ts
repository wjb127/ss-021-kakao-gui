// Claude 실행 취소 (POST { id })
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cancelClaudeRun } from "@/lib/claude-runner";
import { getClaudeRun } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  const run = getClaudeRun(id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (run.status !== "running") {
    return NextResponse.json({ error: `이미 종료됨 (${run.status})` }, { status: 400 });
  }

  const ok = cancelClaudeRun(id);
  if (!ok) {
    return NextResponse.json(
      { error: "프로세스 레지스트리에 없음 (서버 재시작 후 orphan)" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
