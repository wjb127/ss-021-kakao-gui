import { NextRequest, NextResponse } from "next/server";
import { saveContextFile } from "@/lib/context-export";

export async function POST(req: NextRequest) {
  const { chatId, displayName, projectPath } = (await req.json()) as {
    chatId?: string;
    displayName?: string;
    projectPath?: string;
  };
  if (!chatId || !projectPath) {
    return NextResponse.json({ error: "chatId, projectPath required" }, { status: 400 });
  }

  const result = await saveContextFile(chatId, displayName || chatId, projectPath);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, path: result.path });
}
