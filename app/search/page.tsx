"use client";

// 대화 검색 — 메시지 내용/메모/요청 통합 검색
// 별도 라우트 (app/page.tsx 미변경)

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chat } from "@/lib/types";

interface MessageHit {
  id: string;
  chatId: string;
  snippet: string;
  isFromMe: boolean;
  timestamp: string;
  type: string;
}
interface MemoHit { chatId: string; snippet: string; updatedAt: string }
interface RequestHit {
  id: string; chatId: string; title: string; kind: string; status: string; createdAt: string;
}
interface SearchResult {
  query: string;
  error: string | null;
  messages: MessageHit[];
  memos: MemoHit[];
  requests: RequestHit[];
  truncated: boolean;
}

const EMPTY: SearchResult = {
  query: "", error: null, messages: [], memos: [], requests: [], truncated: false,
};

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-[#FFF1A8] text-[#1A1F36] rounded px-0.5">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

function SearchInner() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 초기 진입 시 ?q= 반영
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

  useEffect(() => {
    fetch("/api/chats")
      .then((r) => r.json())
      .then((d) => setChats(Array.isArray(d) ? d : []))
      .catch(() => setChats([]));
  }, []);

  const run = useCallback((q: string) => {
    if (q.trim().length < 2) { setResult(EMPTY); return; }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
      .then((r) => r.json())
      .then((d) => setResult(d))
      .catch(() => setResult(EMPTY))
      .finally(() => setLoading(false));
  }, []);

  // 입력 디바운스 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, run]);

  const chatName = useCallback(
    (id: string) => chats.find((c) => c.id === id)?.display_name || id,
    [chats],
  );

  // 메시지 결과를 채팅방별로 묶기
  const grouped = useMemo(() => {
    const m = new Map<string, MessageHit[]>();
    for (const hit of result.messages) {
      const arr = m.get(hit.chatId) ?? [];
      arr.push(hit);
      m.set(hit.chatId, arr);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [result.messages]);

  const total =
    result.messages.length + result.memos.length + result.requests.length;

  return (
    <div className="h-screen flex flex-col bg-[#D6D8DF] text-[#1A1F36]">
      <header className="shrink-0 bg-white border-b border-[#C7CAD3] px-4 py-3">
        <div className="flex items-center gap-3">
          <a href="/" className="text-[#6B7280] hover:text-[#1A1F36] shrink-0" aria-label="인박스로">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="대화 내용, 메모, 요청 검색 (2글자 이상)"
            className="flex-1 min-w-0 text-sm px-3 py-2 rounded border border-[#D6D8DF] bg-[#F7F8FA] focus:outline-none focus:border-[#2959AA]"
          />
          <a href="/requests" className="shrink-0 text-[11px] text-[#2959AA] hover:underline">요청</a>
        </div>
        <p className="text-[11px] text-[#6B7280] mt-1.5">
          {loading
            ? "검색 중…"
            : query.trim().length < 2
              ? "앱이 캐싱한 1:1·소규모 대화만 검색됩니다 (대형 단톡방 제외)"
              : `${total}건${result.truncated ? " (상한 초과 — 더 좁혀보세요)" : ""}`}
        </p>
      </header>

      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {!loading && query.trim().length >= 2 && total === 0 && (
          <p className="text-xs text-[#6B7280] text-center py-10">결과 없음</p>
        )}

        {result.requests.length > 0 && (
          <section className="bg-white rounded border border-[#C7CAD3]">
            <h2 className="px-3 py-2 border-b border-[#E8E9EC] text-xs font-bold">
              요청 {result.requests.length}건
            </h2>
            <ul className="divide-y divide-[#F0F1F4]">
              {result.requests.map((r) => (
                <li key={r.id} className="px-3 py-2 text-xs">
                  <a href={`/requests`} className="hover:underline">
                    {highlight(r.title, result.query)}
                  </a>
                  <span className="text-[10px] text-[#9AA0AE] ml-2">
                    {chatName(r.chatId)} · {r.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result.memos.length > 0 && (
          <section className="bg-white rounded border border-[#C7CAD3]">
            <h2 className="px-3 py-2 border-b border-[#E8E9EC] text-xs font-bold">
              메모 {result.memos.length}건
            </h2>
            <ul className="divide-y divide-[#F0F1F4]">
              {result.memos.map((m) => (
                <li key={m.chatId} className="px-3 py-2 text-xs">
                  <a
                    href={`/?chat=${encodeURIComponent(m.chatId)}`}
                    className="font-medium hover:underline"
                  >
                    {chatName(m.chatId)}
                  </a>
                  <p className="text-[#6B7280] mt-0.5 break-words">
                    {highlight(m.snippet, result.query)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {grouped.map(([chatId, hits]) => (
          <section key={chatId} className="bg-white rounded border border-[#C7CAD3]">
            <h2 className="px-3 py-2 border-b border-[#E8E9EC] text-xs font-bold flex items-center gap-2">
              <span className="truncate">{chatName(chatId)}</span>
              <span className="text-[#6B7280] font-normal">{hits.length}건</span>
              <a
                href={`/?chat=${encodeURIComponent(chatId)}`}
                className="ml-auto text-[11px] text-[#2959AA] hover:underline shrink-0"
              >
                대화 열기
              </a>
            </h2>
            <ul className="divide-y divide-[#F0F1F4]">
              {hits.map((h) => (
                <li key={h.id} className="px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-[10px] shrink-0 ${h.isFromMe ? "text-[#2959AA]" : "text-[#B23434]"}`}>
                      {h.isFromMe ? "나" : "고객"}
                    </span>
                    <p className="text-xs break-words min-w-0">
                      {highlight(h.snippet, result.query)}
                    </p>
                  </div>
                  <p className="text-[10px] text-[#9AA0AE] mt-0.5">
                    {new Date(h.timestamp).toLocaleString("ko-KR")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-[#6B7280]">로딩 중…</div>}>
      <SearchInner />
    </Suspense>
  );
}
