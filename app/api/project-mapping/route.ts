import { withTeamApi } from "@/lib/team-auth";
export const GET = withTeamApi(handleGET, "chat");
export const POST = withTeamApi(handlePOST, "admin");
export const DELETE = withTeamApi(handleDELETE, "admin");
import { NextRequest, NextResponse } from "next/server";
import { getProjectPaths, addProjectPath, removeProjectPath } from "@/lib/store";

async function handleGET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ error: "chatId required" }, { status: 400 });
  return NextResponse.json({ paths: getProjectPaths(chatId) });
}

async function handlePOST(req: NextRequest) {
  const { chatId, projectPath } = (await req.json()) as {
    chatId?: string;
    projectPath?: string;
  };
  if (!chatId || !projectPath?.trim()) {
    return NextResponse.json({ error: "chatId, projectPath required" }, { status: 400 });
  }
  addProjectPath(chatId, projectPath);
  return NextResponse.json({ paths: getProjectPaths(chatId) });
}

async function handleDELETE(req: NextRequest) {
  const { chatId, projectPath } = (await req.json()) as {
    chatId?: string;
    projectPath?: string;
  };
  if (!chatId || !projectPath) {
    return NextResponse.json({ error: "chatId, projectPath required" }, { status: 400 });
  }
  removeProjectPath(chatId, projectPath);
  return NextResponse.json({ paths: getProjectPaths(chatId) });
}
