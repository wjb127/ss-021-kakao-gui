// 앱 전역 설정 (ntfy 토픽, 워커 on/off 등)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSetting, setSetting } from "@/lib/store";
import { generateTopic } from "@/lib/ntfy";

export const dynamic = "force-dynamic";

const KEYS = [
  "ntfy_topic",
  "ntfy_enabled",
  "worker_enabled",
  "app_url",
  "claude_skip_permissions",
  "send_enabled",
] as const;

export async function GET() {
  // 토픽 없으면 자동 생성
  let topic = getSetting("ntfy_topic");
  if (!topic) {
    topic = generateTopic();
    setSetting("ntfy_topic", topic);
  }

  const result: Record<string, string> = { ntfy_topic: topic };
  for (const k of KEYS) {
    if (k === "ntfy_topic") continue;
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
