"use client";

import { useEffect, useRef, useState } from "react";
import { BOARD_STAGES, type BoardStage, type BoardState } from "@/lib/board-types";
import type { ChatWork, WorkItem } from "@/lib/work-types";
import type { Chat } from "@/lib/types";
import { useIsAdmin } from "./TeamShell";

interface Source { id: string; text: string; timestamp: string }
const field = "w-full min-w-0 rounded border border-[#D6D8DF] bg-white px-2 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-500";
const button = "rounded border border-[#D6D8DF] px-2 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50";

export function WorkPanel({ chat, active, onBoardChange, onOpenMessage, onMemo }: {
  chat: Chat; active: boolean; onBoardChange: (state: BoardState) => void;
  onOpenMessage: (id: string) => void; onMemo: () => void;
}) {
  const admin = useIsAdmin();
  const [work, setWork] = useState<ChatWork | null>(null);
  const [board, setBoard] = useState<BoardState>(chat.board ?? { stage: "new", revision: 0 });
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [title, setTitle] = useState("");
  const [sourceTarget, setSourceTarget] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [searching, setSearching] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);
  const [sourceError, setSourceError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/work?chatId=${encodeURIComponent(chat.id)}`, { signal: abort.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!abort.signal.aborted) { setWork(data.work); setBoard(data.board); setAssignees(data.assignees); setDirty(false); setNotice(""); }
      }).catch((error) => { if (!abort.signal.aborted) setNotice(error.message || "업무 정보를 불러오지 못했어요."); });
    return () => { abort.abort(); searchAbort.current?.abort(); };
  }, [chat.id, loadVersion]);
  // 목록 자동 갱신의 새 수신/보드 변경을 반영하되 더 오래된 상태는 무시한다.
  const currentBoard = chat.board && chat.board.revision > board.revision ? chat.board : board;
  function edit(patch: Partial<ChatWork>) { setWork((previous) => previous ? { ...previous, ...patch } : previous); setDirty(true); setNotice(""); }
  function editItem(id: string, patch: Partial<WorkItem>) {
    if (work) edit({ items: work.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }
  async function save() {
    if (!work || busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chat.id, work }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setWork(data.work); setDirty(false); setNotice("저장했어요.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "저장하지 못했어요."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function changeStage(stage: BoardStage) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, stage, revision: currentBoard.revision }) });
      const data = await response.json();
      if (response.ok || response.status === 409) { setBoard(data); onBoardChange(data); }
      if (!response.ok) throw new Error(data.error);
      setNotice("단계를 변경했어요.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "단계를 변경하지 못했어요."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function searchSources(value: string) {
    searchAbort.current?.abort();
    const abort = new AbortController(); searchAbort.current = abort;
    setSearching(true); setSourceError(""); setSources([]);
    try {
      const params = new URLSearchParams({ chatId: chat.id });
      if (value.trim()) params.set("q", value.trim());
      else { params.set("paginated", "1"); params.set("limit", "50"); params.set("sync", "0"); }
      const response = await fetch(`${value.trim() ? "/api/search" : "/api/messages"}?${params}`, { signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!abort.signal.aborted) setSources((data.messages as Source[]).slice().reverse());
    } catch (error) { if (!abort.signal.aborted) setSourceError(error instanceof Error ? error.message : "메시지를 불러오지 못했어요."); }
    finally { if (!abort.signal.aborted) setSearching(false); }
  }
  return <div className={active ? "flex min-h-0 flex-1 flex-col" : "shrink-0"}>
    <div className="shrink-0 border-b border-[#D6D8DF] p-3 space-y-2">
      <label className="block text-[11px] text-[#6B7280]">업무 단계
        <select className={`${field} mt-1`} value={currentBoard.stage} disabled={!admin || busy} onChange={(event) => void changeStage(event.target.value as BoardStage)}>
          {BOARD_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
        </select>
      </label>
      {work && <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0 text-[11px] text-[#6B7280]">담당자
          <select className={`${field} mt-1`} value={work.assigneeId} disabled={!admin || busy} onChange={(event) => edit({ assigneeId: event.target.value })}>
            <option value="">미지정</option>
            {work.assigneeId && !assignees.some((user) => user.id === work.assigneeId) && <option value={work.assigneeId}>접근 불가 팀원</option>}
            {assignees.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-[11px] text-[#6B7280]">다음 응대일
          <input type="date" className={`${field} mt-1`} value={work.nextContact} disabled={!admin || busy} onChange={(event) => edit({ nextContact: event.target.value })} />
        </label>
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        {admin && work && <button className="rounded bg-[#2959AA] px-2 py-1.5 text-xs text-white disabled:opacity-50" disabled={!dirty || busy} onClick={() => void save()}>{busy ? "저장 중" : "업무 저장"}</button>}
        <button className={button} disabled={busy} onClick={() => { if (!dirty || window.confirm("저장하지 않은 변경을 버리고 최신 정보를 불러올까요?")) setLoadVersion((value) => value + 1); }}>새로고침</button>
        <button className="ml-auto text-xs text-[#2959AA]" onClick={onMemo}>메모 열기</button>
      </div>
      <p role="status" className="text-[11px] text-[#6B7280] break-words">{notice || (dirty ? "저장하지 않은 변경이 있어요." : !work ? "업무 정보를 불러오는 중…" : "")}</p>
    </div>
    {active && work && <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-4">
      <label className="block text-xs font-medium">작업 마감일
        <input type="date" className={`${field} mt-1`} value={work.deadline} disabled={!admin || busy} onChange={(event) => edit({ deadline: event.target.value })} />
      </label>
      <label className="block text-xs font-medium">고객에게 기다리는 자료
        <textarea className={`${field} mt-1 resize-y`} rows={2} maxLength={3000} value={work.waitingFor} disabled={!admin || busy} onChange={(event) => edit({ waitingFor: event.target.value })} />
      </label>
      <section aria-label="업무 체크리스트">
        <h3 className="mb-2 text-xs font-semibold">할 일 <span className="font-normal text-[#6B7280]">{work.items.filter((item) => item.done).length}/{work.items.length}</span></h3>
        {admin && <form className="mb-2 flex gap-1" onSubmit={(event) => { event.preventDefault(); if (!title.trim() || busy || work.items.length >= 100) return;
          edit({ items: [...work.items, { id: crypto.randomUUID(), title: title.trim(), done: false, sourceId: null }] }); setTitle(""); }}>
          <input className={field} aria-label="새 할 일" value={title} maxLength={500} disabled={busy || work.items.length >= 100} onChange={(event) => setTitle(event.target.value)} />
          <button className={`${button} shrink-0`} disabled={!title.trim() || busy || work.items.length >= 100}>추가</button>
        </form>}
        {!work.items.length && <p className="py-3 text-xs text-[#6B7280]">등록된 할 일이 없어요.</p>}
        <ul className="divide-y divide-[#E8E9EC]">
          {work.items.map((item) => <li key={item.id} className="py-2 space-y-1">
            <div className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 shrink-0" aria-label={`${item.title} 완료`} checked={item.done} disabled={!admin || busy} onChange={(event) => editItem(item.id, { done: event.target.checked })} />
              <span className={`min-w-0 flex-1 break-words text-xs leading-5 ${item.done ? "text-[#9CA3AF] line-through" : ""}`}>{item.title}</span>
              {admin && <button className="shrink-0 text-[11px] text-[#6B7280]" disabled={busy} aria-label={`${item.title} 삭제`} onClick={() => { edit({ items: work.items.filter((entry) => entry.id !== item.id) }); if (sourceTarget === item.id) setSourceTarget(null); }}>삭제</button>}
            </div>
            <div className="ml-5 flex flex-wrap gap-2 text-[11px]">
              {item.sourceId && <button className="text-[#2959AA]" onClick={() => onOpenMessage(item.sourceId!)}>원문 보기</button>}
              {admin && <button className="text-[#6B7280]" disabled={busy} onClick={() => { setSourceTarget(item.id); setQuery(""); void searchSources(""); }}>{item.sourceId ? "원문 변경" : "원문 연결"}</button>}
              {admin && item.sourceId && <button className="text-[#6B7280]" disabled={busy} onClick={() => editItem(item.id, { sourceId: null })}>연결 해제</button>}
            </div>
          </li>)}
        </ul>
      </section>
      {sourceTarget && admin && <section className="border-t border-[#D6D8DF] pt-3" aria-label="원문 메시지 선택">
        <div className="mb-2 flex justify-between text-xs font-semibold">원문 메시지 선택<button className="font-normal" onClick={() => { setSourceTarget(null); searchAbort.current?.abort(); }}>닫기</button></div>
        <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); void searchSources(query); }}>
          <input className={field} aria-label="원문 검색어" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className={`${button} shrink-0`} disabled={searching}>검색</button>
        </form>
        <p role="status" className="my-2 text-[11px] text-[#6B7280]">{sourceError || (searching ? "검색 중…" : sources.length ? `${sources.length}개 메시지` : "저장된 메시지가 없어요.")}</p>
        <ul className="max-h-60 overflow-y-auto divide-y divide-[#E8E9EC]">
          {sources.map((source) => <li key={source.id}><button className="w-full py-2 text-left text-xs hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={() => { editItem(sourceTarget, { sourceId: source.id }); setSourceTarget(null); }}>
            <span className="block text-[10px] text-[#6B7280]">{new Date(source.timestamp).toLocaleString("ko-KR")}</span>
            <span className="line-clamp-3 break-words">{source.text || "첨부 메시지"}</span>
          </button></li>)}
        </ul>
      </section>}
    </div>}
  </div>;
}
