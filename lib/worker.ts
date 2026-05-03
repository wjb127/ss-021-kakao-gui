// 카톡 폴링 워커: kakaocli 주기적 호출 → 새 메시지 감지 → ntfy 푸시
// instrumentation.ts에서 시작됨

import { listChats, listMessages } from "./kakaocli";
import { getLastSeen, setLastSeen, upsertMessages, getSetting, getCategories } from "./store";
import { sendPush } from "./telegram";

const DEFAULT_POLL_SEC = 30;
const MIN_POLL_SEC = 30;
const MAX_POLL_SEC = 600;

function getPollIntervalMs(): number {
  const raw = getSetting("poll_interval_sec");
  const n = raw ? parseInt(raw, 10) : DEFAULT_POLL_SEC;
  if (!Number.isFinite(n)) return DEFAULT_POLL_SEC * 1000;
  return Math.max(MIN_POLL_SEC, Math.min(MAX_POLL_SEC, n)) * 1000;
}

// HMR/dev 재시작에서 다중 실행 방지
const GLOBAL_KEY = "__kakaoInboxWorker__";

interface GlobalWithWorker {
  [GLOBAL_KEY]?: { timeout: NodeJS.Timeout | null; running: boolean; stopped: boolean };
}

export function startWorker(): void {
  const g = globalThis as GlobalWithWorker;
  if (g[GLOBAL_KEY]?.timeout) {
    console.log("[worker] 이미 실행 중 — 스킵");
    return;
  }
  console.log("[worker] 폴링 시작 (default=" + DEFAULT_POLL_SEC + "s, 매 tick마다 재계산)");

  const state: GlobalWithWorker[typeof GLOBAL_KEY] = {
    timeout: null,
    running: false,
    stopped: false,
  };
  g[GLOBAL_KEY] = state;

  const schedule = (ms: number) => {
    if (state.stopped) return;
    state.timeout = setTimeout(async () => {
      await tick(state);
      schedule(getPollIntervalMs());
    }, ms);
  };

  // 시작 직후 즉시 1회 → 이후 설정값 기반 재귀 스케줄링
  schedule(0);
}

async function tick(state: { running: boolean }): Promise<void> {
  if (state.running) return; // 겹침 방지
  state.running = true;

  try {
    const enabled = getSetting("worker_enabled");
    if (enabled !== "1") return; // 워커 OFF

    const chats = await listChats(50);
    if (chats.length === 0) return;

    // 카테고리 매핑 로드
    const categories = await getCategories();

    // 최근 활동 채팅 상위 10개만 검사 (kakaocli 부하 줄이기)
    const recent = [...chats]
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
      .slice(0, 10);

    for (const chat of recent) {
      const category = categories[chat.id] ?? null;
      const lastSeen = getLastSeen(chat.id);

      // 첫 폴링: 알림 없이 baseline만 기록
      if (!lastSeen) {
        setLastSeen(chat.id, chat.last_message_at);
        continue;
      }

      // last_message_at이 변하지 않았으면 스킵
      if (chat.last_message_at <= lastSeen) continue;

      // 새 메시지 가져오기 (1일치)
      const msgs = await listMessages(chat.id, "1d", 50);
      const newOnes = msgs.filter(
        (m) => m.timestamp > lastSeen && !m.is_from_me,
      );

      // 캐시 (10명 이하만)
      if (chat.member_count > 0 && chat.member_count <= 10) {
        upsertMessages(msgs);
      }

      // 가장 최신 timestamp로 갱신 (내 메시지 포함)
      const latest = msgs.reduce(
        (max, m) => (m.timestamp > max ? m.timestamp : max),
        lastSeen,
      );
      setLastSeen(chat.id, latest);

      if (newOnes.length === 0) continue;

      // 고객 카테고리만 푸시 (그 외는 baseline만 갱신, 알림 스킵)
      if (category !== "client") continue;

      // 푸시: 마지막 메시지 1개만 (대량 알림 방지)
      const last = newOnes[newOnes.length - 1];
      const baseUrl = getSetting("app_url") || "http://localhost:3032";
      const previewText = last.type === "photo" ? "[사진]" : last.text || `[${last.type}]`;
      const summary = newOnes.length > 1
        ? `${previewText} (외 ${newOnes.length - 1}건)`
        : previewText;

      await sendPush({
        title: chat.display_name || "(알 수 없음)",
        message: summary,
        click: `${baseUrl}/?chat=${encodeURIComponent(chat.id)}`,
        priority: "default",
        tags: ["speech_balloon"],
      });
    }
  } catch (err) {
    console.error("[worker] tick 에러:", err);
  } finally {
    state.running = false;
  }
}
