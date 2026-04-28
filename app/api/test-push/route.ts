// 테스트 푸시 — 설정한 ntfy 토픽으로 샘플 푸시 1건 전송
import { NextResponse } from "next/server";
import { sendPush } from "@/lib/ntfy";
import { getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  // ntfy_enabled가 0이어도 테스트는 일시 활성화로 강제 발송
  const wasEnabled = getSetting("ntfy_enabled");
  if (wasEnabled !== "1") setSetting("ntfy_enabled", "1");

  const ok = await sendPush({
    title: "카카오 인박스 테스트",
    message: "푸시 정상 수신 — 워커 켜면 새 메시지 시 자동 알림",
    priority: "default",
    tags: ["white_check_mark"],
  });

  if (wasEnabled !== "1") setSetting("ntfy_enabled", wasEnabled ?? "0");

  return NextResponse.json({ ok });
}
