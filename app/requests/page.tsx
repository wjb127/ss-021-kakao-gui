"use client";

// 요청 뷰 — 카톡에서 자동 추출된 고객 요청을 채팅방별로 모아서 보여줌
// (app/page.tsx의 3뷰와 별개 라우트. 나중에 뷰 통합 가능)

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Chat, ClientRequest, RequestKind, RequestStatus } from "@/lib/types";

const KIND_LABEL: Record<RequestKind, string> = {
  fix: "수정",
  feature: "신규",
  asset: "자료",
  question: "질문",
  payment: "정산",
  info: "정보",
};

const KIND_COLOR: Record<RequestKind, string> = {
  fix: "bg-[#FDE8E8] text-[#B23434]",
  feature: "bg-[#E4EEFB] text-[#2959AA]",
  asset: "bg-[#E9F3E9] text-[#2F6B33]",
  question: "bg-[#FDF3E0] text-[#96650F]",
  payment: "bg-[#F1E9FB] text-[#5B3A9E]",
  info: "bg-[#EDEEF1] text-[#5A6072]",
};

const STATUS_TABS: { key: RequestStatus; label: string }[] = [
  { key: "open", label: "미처리" },
  { key: "in_progress", label: "진행중" },
  { key: "done", label: "완료" },
  { key: "dismissed", label: "제외" },
];

export default function RequestsPage() {
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [status, setStatus] = useState<RequestStatus>("open");
  const [loading, setLoading] = useState(false);
  const [extractedToday, setExtractedToday] = useState(0);

  const load = useCallback((s: RequestStatus) => {
    setLoading(true);
    fetch(`/api/requests?status=${s}`)
      .then((r) => r.json())
      .then((d) => {
        setRequests(Array.isArray(d.requests) ? d.requests : []);
        setExtractedToday(d.extractedToday ?? 0);
      })
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(status); }, [status, load]);

  useEffect(() => {
    fetch("/api/chats")
      .then((r) => r.json())
      .then((d) => setChats(Array.isArray(d) ? d : []))
      .catch(() => setChats([]));
  }, []);

  const chatName = useCallback(
    (chatId: string) =>
      chats.find((c) => c.id === chatId)?.display_name || chatId,
    [chats],
  );

  // 채팅방별 그룹핑 (= 프로젝트별 현황 대용)
  const grouped = useMemo(() => {
    const map = new Map<string, ClientRequest[]>();
    for (const r of requests) {
      const arr = map.get(r.chatId) ?? [];
      arr.push(r);
      map.set(r.chatId, arr);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [requests]);

  async function changeStatus(id: string, next: RequestStatus) {
    setRequests((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
    } catch {
      load(status);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#D6D8DF] text-[#1A1F36]">
      <header className="shrink-0 bg-white border-b border-[#C7CAD3] px-4 py-3 flex items-center gap-3">
        <a href="/" className="text-[#6B7280] hover:text-[#1A1F36]" aria-label="인박스로">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <h1 className="font-bold text-sm">고객 요청</h1>
        <span className="text-[11px] text-[#6B7280]">
          {requests.length}건 · 오늘 추출 {extractedToday}회
        </span>
        <button
          onClick={() => load(status)}
          className="ml-auto text-[11px] px-2 py-1 border border-[#C7CAD3] rounded hover:bg-[#EDEEF1]"
        >
          {loading ? "..." : "새로고침"}
        </button>
      </header>

      <nav className="shrink-0 bg-white border-b border-[#C7CAD3] px-4 flex gap-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`text-xs px-3 py-2 border-b-2 transition-colors ${
              status === t.key
                ? "border-[#2959AA] text-[#2959AA] font-bold"
                : "border-transparent text-[#6B7280] hover:text-[#1A1F36]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {!loading && grouped.length === 0 && (
          <p className="text-xs text-[#6B7280] text-center py-10">
            해당 상태의 요청이 없습니다.
          </p>
        )}

        {grouped.map(([chatId, items]) => (
          <section key={chatId} className="bg-white rounded border border-[#C7CAD3]">
            <h2 className="px-3 py-2 border-b border-[#E8E9EC] text-xs font-bold flex items-center gap-2">
              <span className="truncate">{chatName(chatId)}</span>
              <span className="text-[#6B7280] font-normal">{items.length}건</span>
              <a
                href={`/?chat=${encodeURIComponent(chatId)}`}
                className="ml-auto text-[11px] text-[#2959AA] hover:underline shrink-0"
              >
                대화 열기
              </a>
            </h2>
            <ul className="divide-y divide-[#F0F1F4]">
              {items.map((r) => (
                <li key={r.id} className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span
                      className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${KIND_COLOR[r.kind]}`}
                    >
                      {KIND_LABEL[r.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium break-words">{r.title}</p>
                      {r.detail && (
                        <p className="text-[11px] text-[#6B7280] mt-0.5 break-words line-clamp-3">
                          {r.detail}
                        </p>
                      )}
                      <p className="text-[10px] text-[#9AA0AE] mt-1">
                        {new Date(r.createdAt).toLocaleString("ko-KR")}
                        {r.confidence != null && ` · 신뢰도 ${Math.round(r.confidence * 100)}%`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-2 justify-end">
                    {status !== "in_progress" && (
                      <button
                        onClick={() => changeStatus(r.id, "in_progress")}
                        className="text-[11px] px-2 py-1 border border-[#C7CAD3] rounded hover:bg-[#EDEEF1]"
                      >
                        진행중
                      </button>
                    )}
                    {status !== "done" && (
                      <button
                        onClick={() => changeStatus(r.id, "done")}
                        className="text-[11px] px-2 py-1 border border-[#C7CAD3] rounded hover:bg-[#EDEEF1]"
                      >
                        완료
                      </button>
                    )}
                    {status !== "dismissed" && (
                      <button
                        onClick={() => changeStatus(r.id, "dismissed")}
                        className="text-[11px] px-2 py-1 border border-[#C7CAD3] rounded text-[#6B7280] hover:bg-[#EDEEF1]"
                      >
                        제외
                      </button>
                    )}
                    {status !== "open" && (
                      <button
                        onClick={() => changeStatus(r.id, "open")}
                        className="text-[11px] px-2 py-1 border border-[#C7CAD3] rounded hover:bg-[#EDEEF1]"
                      >
                        되돌리기
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
