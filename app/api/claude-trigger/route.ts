// Claude Code 원격 실행 트리거
// 1) KAKAO_CONTEXT.md를 projectPath에 저장
// 2) claude CLI를 spawn — prompt는 사용자 지시 + 컨텍스트 참조
import { NextRequest, NextResponse } from "next/server";
import { saveContextFile } from "@/lib/context-export";
import { createClaudeRun } from "@/lib/store";
import { startClaudeRun } from "@/lib/claude-runner";

export const dynamic = "force-dynamic";

interface TriggerBody {
  chatId?: string;
  displayName?: string;
  projectPath?: string;
  instruction?: string;
}

export async function POST(req: NextRequest) {
  const { chatId, displayName, projectPath, instruction } =
    (await req.json()) as TriggerBody;

  if (!chatId || !projectPath || !instruction?.trim()) {
    return NextResponse.json(
      { error: "chatId, projectPath, instruction 필수" },
      { status: 400 },
    );
  }

  // 1. 컨텍스트 파일 저장
  const ctx = await saveContextFile(chatId, displayName || chatId, projectPath);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: 400 });
  }

  // 2. Claude prompt 조립
  const prompt = [
    `방금 ./KAKAO_CONTEXT.md 갱신함 (카카오톡 고객 문의 + 메모 + 분석).`,
    `먼저 그 파일을 읽고 현재 상황 파악.`,
    ``,
    `사용자 지시:`,
    instruction.trim(),
    ``,
    `위 지시에 따라 처리. 변경사항 있으면 마지막에 한 단락으로 요약.`,
  ].join("\n");

  // 3. DB run 생성
  const runId = createClaudeRun(chatId, projectPath, prompt);

  // 4. spawn (await 안 함 — 백그라운드)
  startClaudeRun({ runId, cwd: projectPath, prompt });

  return NextResponse.json({ runId, contextPath: ctx.path });
}
