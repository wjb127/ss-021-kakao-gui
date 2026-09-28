// AI둥지(ss-102) 연동 — 에이전트 세션 모니터가 프로젝트별 클라 요청을 가져가고 상태를 바꾼다.
// 쿠키 로그인(팀 계정) 대신 토큰으로만 연다: app_settings.aidungji_token 이 있어야 켜지고, 없으면 404(없는 척).
// 읽기(진행 중 요청) + 요청 상태 변경만. 카톡 발송·답변 초안은 이 앱에서 사람이 한다.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getChatSnapshot } from "@/lib/kakaocli";
import {
  getProjectPath,
  getSetting,
  listRequests,
  updateRequestStatus,
} from "@/lib/store";
import type { RequestStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_STATUS: RequestStatus[] = [
  "open",
  "in_progress",
  "done",
  "dismissed",
];
const PER_PROJECT = 20;

function authorized(req: NextRequest): boolean | null {
  const token = getSetting("aidungji_token");
  if (!token || token.length < 24) return null; // 연동 꺼짐
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const given = Buffer.from(auth.slice(7));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

function deny(ok: boolean | null) {
  return ok === null
    ? NextResponse.json({ error: "없음" }, { status: 404 })
    : NextResponse.json({ error: "토큰이 틀려요" }, { status: 401 });
}

// 진행 중(open·in_progress) 클라 요청을 프로젝트 폴더별로
export async function GET(req: NextRequest) {
  const ok = authorized(req);
  if (!ok) return deny(ok);
  const names = new Map(
    (getChatSnapshot(1000) ?? []).map((c) => [c.id, c.display_name]),
  );
  const projects: Record<string, unknown[]> = {};
  for (const status of ["open", "in_progress"] as RequestStatus[]) {
    for (const r of listRequests({ status, limit: 500 })) {
      const path = r.projectPath ?? getProjectPath(r.chatId);
      if (!path) continue;
      const list = (projects[path] ??= []);
      if (list.length >= PER_PROJECT) continue;
      list.push({
        id: r.id,
        chatId: r.chatId,
        chatName: names.get(r.chatId) ?? null,
        title: r.title,
        detail: r.detail,
        kind: r.kind,
        status: r.status,
        createdAt: r.createdAt,
      });
    }
  }
  return NextResponse.json(
    {
      ok: true,
      appUrl: getSetting("app_url") || "http://localhost:3032",
      projects,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// 요청 상태 변경 {id, status}
export async function PATCH(req: NextRequest) {
  const ok = authorized(req);
  if (!ok) return deny(ok);
  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 이 필요해요" }, { status: 400 });
  }
  if (
    !body.id ||
    !body.status ||
    !VALID_STATUS.includes(body.status as RequestStatus)
  ) {
    return NextResponse.json(
      { error: "id, status(open|in_progress|done|dismissed) 필수" },
      { status: 400 },
    );
  }
  if (!updateRequestStatus(body.id, body.status as RequestStatus)) {
    return NextResponse.json({ error: "해당 요청 없음" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
