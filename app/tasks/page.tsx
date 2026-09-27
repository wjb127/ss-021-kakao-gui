"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTeamUser } from "@/components/TeamShell";
import { agendaGroup, type AgendaGroup, type AgendaTask } from "@/lib/task-agenda";
import { BOARD_STAGES } from "@/lib/board-types";

const GROUPS: { id: AgendaGroup; label: string }[] = [
  { id: "overdue", label: "기한 지남" }, { id: "today", label: "오늘" }, { id: "week", label: "이번 주" },
  { id: "later", label: "이후 예정" }, { id: "undated", label: "날짜 없음" },
];
export default function TasksPage() {
  const user = useTeamUser();
  const [data, setData] = useState<{ today: string; tasks: AgendaTask[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mine, setMine] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/tasks", { cache: "no-store", signal });
      if (!response.ok) throw new Error("tasks");
      const next = await response.json();
      if (!signal?.aborted) { setData(next); setError(false); }
    } catch { if (!signal?.aborted) { setError(true); setData(null); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    // 상태 변경은 fetch 완료 뒤에만 일어나며 언마운트 시 요청을 취소한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);
  const tasks = (data?.tasks ?? []).filter((task) => !mine || task.assigneeId === user?.id);
  return <main className="h-full overflow-y-auto bg-[#F5F6F8] text-[#1A1F36]">
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold">오늘 할 일</h1><p className="mt-1 text-xs text-slate-500">{data?.today ?? ""} · 한국 시간 · 이번 주 일요일까지</p></div>
        <div className="flex items-center gap-3 text-sm"><Link href="/" className="text-[#2959AA]">인박스</Link><button disabled={loading} onClick={() => { setLoading(true); void load(); }} className="rounded border border-slate-300 bg-white px-3 py-2 disabled:opacity-50">{loading ? "불러오는 중…" : "새로고침"}</button></div>
      </div>
      <div className="my-5 flex flex-wrap items-center gap-2 text-sm" aria-label="담당 필터">
        {[false, true].map((value) => <button key={String(value)} aria-pressed={mine === value} onClick={() => setMine(value)} className={`rounded px-3 py-2 ${mine === value ? "bg-[#2959AA] text-white" : "border border-slate-300 bg-white"}`}>{value ? "내 담당" : "전체"}</button>)}
        <span className="ml-1 text-xs text-slate-500">{tasks.length}건 · 조회 가능한 대화</span>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">미완료 할 일은 대화의 마감일 기준으로 모아요. 응대완료 대화는 제외돼요. 날짜와 완료 여부는 대화의 업무 탭에서 수정할 수 있어요.</p>
      {error ? <div role="alert" className="rounded border border-red-200 bg-white p-4 text-sm text-red-700">할 일을 불러오지 못했어요. 새로고침으로 다시 시도해 주세요.</div>
        : !data ? <p role="status" className="py-8 text-sm text-slate-500">할 일을 불러오는 중…</p>
        : GROUPS.map((group) => {
          const items = tasks.filter((task) => agendaGroup(task.date, data.today) === group.id);
          return <section key={group.id} className="mb-5" aria-label={group.label}>
            <h2 className={`mb-2 text-sm font-semibold ${group.id === "overdue" && items.length ? "text-red-700" : ""}`}>{group.label} <span className="ml-1 font-normal text-slate-500">{items.length}</span></h2>
            <div className="overflow-hidden rounded-md border border-[#D6D8DF] bg-white">
              {!items.length ? <p className="px-4 py-4 text-sm text-slate-400">{group.id === "today" ? "오늘 예정된 할 일이 없어요." : "해당하는 할 일이 없어요."}</p> : items.map((task) =>
                <Link key={task.id} href={`/?chat=${encodeURIComponent(task.chatId)}&work=1`} className="block border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[#2959AA]">
                  <div className="flex items-start gap-2"><span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{task.kind}</span><span className="min-w-0 flex-1 break-words text-sm font-medium">{task.title}</span><span className="shrink-0 text-xs text-slate-500">{task.date ? task.date.slice(5).replace("-", "/") : "미정"}</span></div>
                  <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 break-all text-xs text-slate-500"><span className="font-medium text-[#2959AA]">{task.chatName}</span><span>{task.assigneeName}</span><span>{BOARD_STAGES.find((stage) => stage.id === task.stage)?.label}</span><span className="ml-auto">대화·업무 보기 →</span></div>
                </Link>)}
            </div>
          </section>;
        })}
    </div>
  </main>;
}
