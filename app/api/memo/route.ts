import { NextRequest, NextResponse } from "next/server";
import { getMemo, setMemo } from "@/lib/store";

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ error: "chatId required" }, { status: 400 });
  return NextResponse.json({ content: getMemo(chatId) });
}

export async function POST(req: NextRequest) {
  const { chatId, content } = (await req.json()) as {
    chatId?: string;
    content?: string;
  };
  if (!chatId) return NextResponse.json({ error: "chatId required" }, { status: 400 });
  setMemo(chatId, content ?? "");
  return NextResponse.json({ ok: true });
}
