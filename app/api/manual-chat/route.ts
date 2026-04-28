import { NextRequest, NextResponse } from "next/server";
import { createManualChat, deleteManualChat } from "@/lib/store";

export async function POST(req: NextRequest) {
  const { displayName } = (await req.json()) as { displayName?: string };
  if (!displayName?.trim()) {
    return NextResponse.json({ error: "displayName required" }, { status: 400 });
  }
  const id = createManualChat(displayName.trim());
  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  const { chatId } = (await req.json()) as { chatId?: string };
  if (!chatId) return NextResponse.json({ error: "chatId required" }, { status: 400 });
  deleteManualChat(chatId);
  return NextResponse.json({ ok: true });
}
