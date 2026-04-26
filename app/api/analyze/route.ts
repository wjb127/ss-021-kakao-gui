// AI 분석 - OpenAI 호출
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { listMessages } from "@/lib/kakaocli";
import { setTodoForChat } from "@/lib/store";
import type { Analysis, Message, Urgency } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

// 분석할 가치 있는 텍스트 메시지만 추출
function filterRealText(messages: Message[]): Message[] {
  return messages.filter((m) => {
    if (m.type !== "text") return false;
    const t = (m.text || "").trim();
    if (!t) return false;
    // JSON blob 같은 게 들어오면 스킵
    if (t.startsWith("{") && t.endsWith("}") && t.length > 200) return false;
    if (t.startsWith("[") && t.endsWith("]") && t.length > 200) return false;
    return true;
  });
}

function buildConversationDump(messages: Message[]): string {
  // 시간순 정렬 (오름차순)
  const sorted = [...messages].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  return sorted
    .map((m) => {
      const who = m.is_from_me ? "나" : `상대(${m.sender_id.slice(-4)})`;
      return `[${m.timestamp}] ${who}: ${m.text}`;
    })
    .join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { chatId?: string };
    if (!body.chatId) {
      return NextResponse.json(
        { error: "chatId 가 필요함" },
        { status: 400 },
      );
    }

    const all = await listMessages(body.chatId, "10d", 1000);
    const real = filterRealText(all);

    if (real.length === 0) {
      return NextResponse.json(
        { error: "분석할 텍스트 메시지가 없음" },
        { status: 400 },
      );
    }

    const dump = buildConversationDump(real);

    const prompt = `당신은 개발자의 CS 매니저입니다.
아래 카카오톡 대화를 분석해서 JSON으로 반환:
{
  "summary": "한 줄 요약",
  "urgency": "Low|Medium|High|Critical",
  "todos": ["할 일 1", "할 일 2", ...],
  "nextAction": "가장 즉각적으로 해야 할 것 1개"
}
메시지: """
${dump}
"""`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "JSON 만 반환. markdown 코드블록 없이 순수 JSON 객체로만 응답할 것.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: {
      summary?: string;
      urgency?: string;
      todos?: string[];
      nextAction?: string;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "AI 응답 파싱 실패", raw },
        { status: 500 },
      );
    }

    const urgency: Urgency =
      parsed.urgency === "Critical" ||
      parsed.urgency === "High" ||
      parsed.urgency === "Medium" ||
      parsed.urgency === "Low"
        ? parsed.urgency
        : "Medium";

    const analysis: Analysis = {
      summary: parsed.summary || "(요약 없음)",
      urgency,
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
      nextAction: parsed.nextAction || "",
      analyzedAt: new Date().toISOString(),
    };

    await setTodoForChat(body.chatId, analysis);

    return NextResponse.json(analysis);
  } catch (err) {
    console.error("analyze 실패:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
