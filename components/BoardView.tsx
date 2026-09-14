"use client";
import { useIsAdmin } from "./TeamShell";

// 보드 뷰 — 채팅방별 업무 단계 관리
import { useEffect, useRef, useState } from "react";
import type { Category, Chat } from "@/lib/types";
import { ViewSwitcher } from "./ViewSwitcher";
import { BOARD_STAGES, type BoardStage, type BoardState } from "@/lib/board-types";

interface Props {
  chats: Chat[];
  filter: "all" | "client" | "casual";
  onFilterChange: (f: "all" | "client" | "casual") => void;
  onCategoryChange: (chatId: string, category: Category | null) => void;
  onSwitchToInbox: (chatId?: string) => void;
  onSwitchToCard: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}

const CATEGORY_STYLES: Record<Category, string> = {
  client: "bg-[#2959AA] text-white",
  casual: "bg-[#16A34A] text-white",
  bot:    "bg-[#6B7280] text-white",
};
const CATEGORY_LABELS: Record<Category, string> = {
  client: "고객", casual: "잡담", bot: "봇",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    return sameDay
      ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
      : `${d.getMonth() + 1}/${d.getDate()}`;
  } catch { return ""; }
}

// 카드별 메모 관리 (보드/카드 뷰 공용)
export function MemoCard({
  chat,
  onOpenInbox,
  variant = "horizontal",
}: {
  chat: Chat;
  onOpenInbox: () => void;
  variant?: "horizontal" | "grid";
}) {
  const readOnly = !useIsAdmin();
  const [memo, setMemo] = useState("");
  const [memoOpen, setMemoOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/memo?chatId=${encodeURIComponent(chat.id)}`)
      .then((r) => r.json())
      .then((d: { content: string }) => setMemo(d.content ?? ""))
      .catch(() => {});
  }, [chat.id]);

  function handleChange(val: string) {
    setMemo(val);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, content: val }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 1000);
  }

  const name = (!chat.display_name || chat.display_name === "(unknown)")
    ? `(멤버 ${chat.member_count}명)`
    : chat.display_name;

  return (
    <div
      className={`flex flex-col bg-white border border-[#D6D8DF] rounded-lg overflow-hidden shadow-sm ${
        variant === "horizontal" ? "w-56 shrink-0" : `w-full ${memoOpen ? "h-72" : ""}`
      }`}
      style={variant === "horizontal" && memoOpen ? { height: "calc(100vh - 56px - 2rem)" } : undefined}
    >
      {/* 카드 헤더 */}
      <div className={`flex items-center gap-1 px-2 py-1 ${memoOpen ? "border-b border-[#E8E9EC]" : ""}`}>
        <button
          onClick={onOpenInbox}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left group min-h-8"
          title={`${name} · 인박스에서 열기`}
        >
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#1A1F36] group-hover:text-[#2959AA] transition-colors">
              {name}
            </span>
            {chat.unread_count > 0 && (
              <span className="shrink-0 text-[9px] bg-red-500 text-white rounded-full px-1.5 py-0.5">
                {chat.unread_count > 99 ? "99+" : chat.unread_count}
              </span>
            )}
            {chat.category && (
              <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_STYLES[chat.category]}`}>
                {CATEGORY_LABELS[chat.category]}
              </span>
            )}
            <span className="shrink-0 whitespace-nowrap text-[9px] text-[#9CA3AF]">👥 {chat.member_count}</span>
            <span className="shrink-0 text-[9px] text-[#9CA3AF]">{formatTime(chat.last_message_at)}</span>
        </button>
          <button type="button" aria-expanded={memoOpen}
            aria-label={memoOpen ? "메모 접기" : "메모 펼치기"}
            title={memoOpen ? "메모 접기" : "메모 펼치기"}
            aria-controls={`board-memo-${chat.id}`}
            onClick={() => setMemoOpen((open) => !open)}
            className="flex h-8 w-8 shrink-0 items-center justify-center text-[#6B7280] hover:bg-[#F5F6F8] hover:text-[#2959AA] focus-visible:outline-2 focus-visible:outline-[#2959AA] rounded">
            <svg className={`h-3.5 w-3.5 ${memoOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>
      </div>

      {/* 접힌 상태에서는 메모 영역의 여백도 숨긴다. */}
      <div className={memoOpen ? "flex-1 flex flex-col p-2 min-h-0" : "hidden"}>
        {saved && <span className="text-[9px] text-green-500 mb-1">저장됨</span>}
        <textarea id={`board-memo-${chat.id}`} aria-label={`${name} 메모`} hidden={!memoOpen} readOnly={readOnly}
          value={memo}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="메모 없음"
          className="flex-1 w-full text-xs text-[#1A1F36] bg-[#F5F6F8] rounded p-1.5 resize-none focus:outline-none focus:bg-white focus:border focus:border-[#2959AA] placeholder-[#C8CAD1] leading-[1.5] min-h-[80px]"
        />
      </div>
    </div>
  );
}

export function BoardView({
  chats,
  onSwitchToInbox,
  onSwitchToCard,
  onOpenSettings,
  onNewChat,
  refreshing,
  onRefresh,
}: Props) {
  const isAdmin = useIsAdmin();
  const [overrides, setOverrides] = useState<Record<string, BoardState>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<BoardStage | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const pendingRef = useRef(new Set<string>());
  const [notice, setNotice] = useState("");
  function stateFor(chat: Chat): BoardState {
    const server = chat.board ?? { stage: "new", revision: 0 };
    const local = overrides[chat.id];
    return local && local.revision > server.revision ? local : server;
  }
  async function move(chat: Chat, stage: BoardStage) {
    if (!isAdmin || pendingRef.current.has(chat.id) || stateFor(chat).stage === stage) return;
    pendingRef.current.add(chat.id);
    setPending([...pendingRef.current]);
    setNotice("");
    try {
      const response = await fetch("/api/board", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, stage, revision: stateFor(chat).revision }),
      });
      const result = await response.json();
      if (response.ok || response.status === 409) {
        setOverrides((previous) => ({ ...previous, [chat.id]: { stage: result.stage, revision: result.revision } }));
      }
      if (!response.ok) throw new Error(result.error || "단계를 저장하지 못했어요.");
      setNotice(`${chat.display_name} · ${BOARD_STAGES.find((item) => item.id === stage)?.label} 단계로 이동했어요.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "단계를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      pendingRef.current.delete(chat.id);
      setPending([...pendingRef.current]);
    }
  }
  // 보드 뷰는 고객 카테고리만 강제
  const filtered = [...chats]
    .filter((c) => c.category === "client")
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));

  return (
    <div className="flex flex-col h-screen bg-[#F5F6F8] overflow-hidden">
      {/* 상단 바 — ChatList 헤더와 동일 아이콘/순서 */}
      <div className="px-3 py-3 bg-white border-b border-[#D6D8DF] flex flex-wrap items-center gap-2 md:gap-3 shrink-0">
        <span className="text-base md:text-sm font-bold text-[#1A1F36] shrink-0">카카오톡 인박스</span>

        {/* 보드 뷰 = 고객 전용 표시 */}
        <span className="text-sm md:text-xs px-2.5 py-1 rounded bg-[#2959AA] text-white">고객</span>

        <span className="hidden md:inline text-[10px] text-[#9CA3AF]">{filtered.length}개</span>

        <div className="ml-auto flex items-center gap-0.5 md:gap-1.5">
          {/* 1. 새 대화 추가 */}
          <button
            data-admin-only
            onClick={onNewChat}
            className="p-2 md:p-0 text-[#6B7280] hover:text-[#1A1F36] transition-colors"
            title="새 대화 추가"
            aria-label="새 대화 추가"
          >
            <svg className="w-6 h-6 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {/* 2. 뷰 전환 드롭다운 */}
          <ViewSwitcher
            current="board"
            onChange={(v) => {
              if (v === "inbox") onSwitchToInbox();
              else if (v === "card") onSwitchToCard();
            }}
          />
          {/* 3. 새로고침 */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-2 md:p-0 text-[#6B7280] hover:text-[#1A1F36] disabled:text-[#9CA3AF] transition-colors"
            title="새로고침"
            aria-label="새로고침"
          >
            <svg
              className={`w-6 h-6 md:w-4 md:h-4 ${refreshing ? "animate-spin text-[#2959AA]" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {/* 4. 설정 */}
          <button
            data-admin-only
            onClick={onOpenSettings}
            className="p-2 md:p-0 text-[#6B7280] hover:text-[#1A1F36] transition-colors"
            title="설정"
            aria-label="설정"
          >
            <svg className="w-6 h-6 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-4 py-2 text-xs text-[#6B7280] min-h-9" role="status" aria-live="polite">
        {notice || (isAdmin ? "카드를 끌거나 단계 메뉴로 이동하세요. 새 미확인 메시지가 오면 응대필요로 돌아갑니다." : "업무 단계는 관리자가 변경할 수 있어요.")}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
          {BOARD_STAGES.map((stage) => {
            const cards = filtered.filter((chat) => stateFor(chat).stage === stage.id);
            return <section key={stage.id} aria-label={stage.label}
              onDragOver={(event) => { if (isAdmin && dragging) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(stage.id); } }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }}
              onDrop={(event) => {
                event.preventDefault();
                const chat = filtered.find((item) => item.id === dragging);
                setDragging(null); setOver(null);
                if (chat) void move(chat, stage.id);
              }}
              className={`min-w-0 rounded-lg border p-2 min-h-44 ${over === stage.id ? "border-[#2959AA] bg-blue-50" : "border-[#D6D8DF] bg-[#ECEEF2]"}`}>
              <h2 className="flex items-center gap-2 px-1 py-2 mb-2 text-sm font-semibold text-[#1A1F36]">
                {stage.label}<span className="text-xs font-normal text-[#6B7280]">{cards.length}</span>
              </h2>
              <div className="space-y-3">
                {cards.length === 0 && <p className="py-8 text-center text-xs text-[#6B7280]">채팅방이 없습니다</p>}
                {cards.map((chat) => <div key={chat.id} className={dragging === chat.id ? "opacity-50" : ""}>
                  {isAdmin && <div className="flex items-center justify-between gap-2 mb-1">
                    <span draggable={!pending.includes(chat.id)} title="드래그하여 단계 이동"
                      onDragStart={(event) => { event.dataTransfer.setData("text/plain", chat.id); event.dataTransfer.effectAllowed = "move"; setDragging(chat.id); }}
                      onDragEnd={() => { setDragging(null); setOver(null); }}
                      className="cursor-grab active:cursor-grabbing select-none text-xs text-[#6B7280] px-2 py-2">⠿ 이동</span>
                    <select aria-label={`${chat.display_name} 업무 단계`} value={stateFor(chat).stage}
                      disabled={pending.includes(chat.id)} onChange={(event) => void move(chat, event.target.value as BoardStage)}
                      className="min-h-9 max-w-full rounded border border-[#D6D8DF] bg-white px-2 text-xs text-[#1A1F36] disabled:opacity-50">
                      {BOARD_STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </div>}
                  <MemoCard chat={chat} variant="grid" onOpenInbox={() => onSwitchToInbox(chat.id)} />
                </div>)}
              </div>
            </section>;
          })}
        </div>
      </div>
    </div>
  );
}
