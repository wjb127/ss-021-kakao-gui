// 앱 전역 설정 (텔레그램 봇, 워커 on/off 등)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

const KEYS = [
  "telegram_bot_token",
  "telegram_chat_id",
  "telegram_enabled",
  "worker_enabled",
  "app_url",
  "claude_skip_permissions",
  "send_enabled",
  "poll_interval_sec",
] as const;

export async function GET() {
  const result: Record<string, string> = {};
  for (const k of KEYS) {
    result[k] = getSetting(k) ?? "";
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, string>;
  for (const k of KEYS) {
    if (k in body) {
      setSetting(k, String(body[k] ?? ""));
    }
  }
  return NextResponse.json({ ok: true });
}
