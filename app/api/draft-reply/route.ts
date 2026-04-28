// AI 답변 초안 생성 — Claude로 카카오톡 답변 1건 작성
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCachedMessages, getMemo } from "@/lib/store";
import { listMessages } from "@/lib/kakaocli";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Tone = "formal" | "casual" | "brief";

const TONE_GUIDE: Record<Tone, string> = {
  formal: "정중하고 격식 있는 존댓말. 감사·확인 표현 포함. 비즈니스 카톡 톤.",
  casual: "친근하면서도 예의 갖춘 존댓말. 'ㅎㅎ', '~네요' 같은 자연스러운 어미 사용 가능.",
  brief: "최대한 짧고 핵심만. 1~2문장. 군더더기 없이.",
};

const SYSTEM_PROMPT = `너는 1인 개발자/프리랜서의 카카오톡 답변 초안을 작성한다.

규칙:
- 한국어로만 답변
- 답변 본문만 출력 (인사말 중복 금지, 머리말 "답변:" 금지, 따옴표 금지, 마크다운 금지)
- 상대방의 마지막 메시지에 직접 응답
- 모르는 정보는 추측 금지 — "확인 후 답변드릴게요" 식으로 처리
- 가격·일정 약속은 절대 임의 생성 금지 — 사용자가 제공한 메모 범위 내에서만
- 이모지는 자연스러운 경우만 최소 사용 (😊, ㅎㅎ 정도)`;

interface DraftRequest {
  chatId?: string;
  tone?: Tone;
  instruction?: string; // 사용자 추가 지시
}

export async function POST(req: NextRequest) {
  const { chatId, tone = "casual", instruction } = (await req.json()) as DraftRequest;

  if (!chatId) {
    return NextResponse.json({ error: "chatId required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }

  // 메시지 로드: manual_은 캐시만, 그 외는 kakaocli
  let messages: Message[] = [];
  if (chatId.startsWith("manual_")) {
    messages = getCachedMessages(chatId);
  } else {
    const cached = getCachedMessages(chatId);
    messages = cached.length > 0 ? cached : await listMessages(chatId, "10d", 200);
  }

  // 최근 30개로 제한
  const sorted = [...messages].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const recent = sorted.slice(-30);

  if (recent.length === 0) {
    return NextResponse.json({ error: "메시지 없음" }, { status: 400 });
  }

  // 메모 (있으면 컨텍스트로 전달)
  const memo = getMemo(chatId);

  // 대화 텍스트 포맷
  const transcript = recent
    .filter((m) => m.text?.trim() || m.type === "photo")
    .map((m) => {
      const who = m.is_from_me ? "나" : "상대";
      const text = m.type === "photo" ? "[사진]" : m.text;
      return `${who}: ${text}`;
    })
    .join("\n");

  const userPrompt = [
    `톤: ${TONE_GUIDE[tone]}`,
    memo ? `\n고객 메모(참고용):\n"""\n${memo}\n"""` : "",
    instruction ? `\n추가 지시:\n${instruction}` : "",
    `\n최근 대화:\n"""\n${transcript}\n"""`,
    `\n위 대화에서 상대방의 마지막 메시지에 대한 답변을 작성하라. 본문만 출력.`,
  ].filter(Boolean).join("\n");

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const draft = response.content[0].type === "text"
      ? response.content[0].text.trim()
      : "";

    if (!draft) {
      return NextResponse.json({ error: "초안 생성 실패" }, { status: 500 });
    }

    return NextResponse.json({ draft, tone });
  } catch (e) {
    return NextResponse.json({ error: `Claude 호출 실패: ${String(e)}` }, { status: 500 });
  }
}
