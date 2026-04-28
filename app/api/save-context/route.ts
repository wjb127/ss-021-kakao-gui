import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getCachedMessages, getTodoForChat } from "@/lib/store";
import type { Message } from "@/lib/types";

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

export async function POST(req: NextRequest) {
  const { chatId, displayName, projectPath } = (await req.json()) as {
    chatId?: string;
    displayName?: string;
    projectPath?: string;
  };
  if (!chatId || !projectPath) {
    return NextResponse.json({ error: "chatId, projectPath required" }, { status: 400 });
  }
  if (!existsSync(projectPath)) {
    return NextResponse.json({ error: `경로 없음: ${projectPath}` }, { status: 400 });
  }

  const messages = getCachedMessages(chatId);
  const analysis = await getTodoForChat(chatId);
  const chatName = displayName || chatId;

  const lines: string[] = [];
  lines.push(`# 카카오 컨텍스트: ${chatName}`);
  lines.push(`업데이트: ${nowKST()}`);
  lines.push("");

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

  const outPath = path.join(projectPath, "KAKAO_CONTEXT.md");
  writeFileSync(outPath, lines.join("\n"), "utf-8");

  return NextResponse.json({ ok: true, path: outPath });
}
