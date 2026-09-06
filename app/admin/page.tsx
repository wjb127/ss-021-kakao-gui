"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTeamUser } from "@/components/TeamShell";
import type { TeamUser } from "@/lib/team-types";
import type { Chat } from "@/lib/types";

interface AuditRow { action: string; actor: string | null; targetId: string | null; createdAt: string }
const actionLabels: Record<string, string> = { "user.create": "계정 생성", "user.update": "계정·권한 변경", "user.invite": "초대 코드 재발급", "user.revoke": "접속 종료", "user.activate": "비밀번호 설정", "user.login": "로그인" };

export default function TeamAdminPage() {
  const actor = useTeamUser();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [selected, setSelected] = useState<TeamUser | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState<{ name: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [teamResponse, chatResponse] = await Promise.all([fetch("/api/team"), fetch("/api/chats?limit=1000")]);
      if (!teamResponse.ok || !chatResponse.ok) throw new Error("팀 정보를 불러오지 못했어요.");
      const team = await teamResponse.json();
      setError("");
      setUsers(team.users); setEvents(team.audit); setChats(await chatResponse.json());
    } catch (err) { setError(err instanceof Error ? err.message : "연결을 확인해 주세요."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (actor?.role !== "admin") return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [actor?.role, load]);

  if (actor?.role !== "admin") return <main className="p-6 text-sm">관리자만 접근할 수 있어요. <Link className="text-blue-700 underline" href="/">인박스로 돌아가기</Link></main>;
  const activeCount = users.filter((u) => u.active).length;
  const visibleChats = chats.filter((c) => `${c.display_name} ${c.id}`.toLowerCase().includes(query.toLowerCase()));
  const missingGrants = selected?.chatIds.filter((id) => !chats.some((c) => c.id === id)) ?? [];

  async function mutate(body: unknown, method = "PATCH") {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/team", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await load();
      return result;
    } catch (err) { setError(err instanceof Error ? err.message : "저장하지 못했어요."); return null; }
    finally { setBusy(false); }
  }

  return <main className="h-full overflow-y-auto bg-[#F5F6F8] p-4 md:p-6">
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">팀 관리</h1><p className="mt-1 text-sm text-slate-500">활성 계정 {activeCount} / 10명 · 관리자 포함</p></div><button className="team-secondary" disabled={busy || loading} onClick={() => { setSelected(null); void load(); }}>새로고침</button></div>
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}
      {invite && <section className="rounded border border-blue-200 bg-blue-50 p-4"><div className="flex justify-between gap-3"><h2 className="text-sm font-semibold">{invite.name} 초대 코드</h2><button className="text-sm" onClick={() => setInvite(null)}>닫기</button></div><p className="mt-2 text-xs leading-5 text-slate-600">로그인 화면의 ‘초대 코드로 계정 시작’에서 사용해 주세요. 24시간 동안 한 번만 사용할 수 있어요. 코드는 이 화면을 닫으면 다시 표시되지 않아요.</p><input aria-label="초대 코드" type="password" readOnly value={invite.token} className="team-input mt-3" autoComplete="off"/><button className="team-secondary mt-2" onClick={async () => { try { await navigator.clipboard.writeText(invite.token); setNotice("초대 코드를 복사했어요."); } catch { setError("복사가 지원되지 않아요. 코드 입력란을 선택해 복사해 주세요."); } }}>코드 복사</button></section>}
      <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="rounded-md border border-[#D6D8DF] bg-white p-4">
            <h2 className="text-sm font-semibold">팀원 추가</h2>
            <form className="mt-4 space-y-3" onSubmit={async (event) => {
              event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
              const result = await mutate(Object.fromEntries(data), "POST");
              if (result) { setInvite({ name: result.user.displayName, token: result.token }); setSelected(result.user); form.reset(); setNotice("계정을 만들었어요. 조회할 채팅방을 지정해 주세요."); }
            }}>
              <label className="block text-xs font-medium">아이디<input name="username" required minLength={3} maxLength={32} pattern="[a-z0-9][a-z0-9._\-]{2,31}" autoComplete="off" className="team-input mt-1" /></label>
              <p className="text-xs text-slate-500">영문 소문자·숫자·._- 조합, 3~32자</p>
              <label className="block text-xs font-medium">이름<input name="displayName" required maxLength={50} className="team-input mt-1" /></label>
              <label className="block text-xs font-medium">역할<select name="role" className="team-input mt-1" defaultValue="viewer"><option value="viewer">열람자 — 지정된 채팅방 조회</option><option value="admin">관리자 — 전체 조회·관리</option></select></label>
              <button disabled={busy || loading || activeCount >= 10} className="team-primary w-full">계정 만들기</button>
              {activeCount >= 10 && <p className="text-xs text-slate-500">계정을 추가하려면 기존 계정을 비활성화해 주세요.</p>}
            </form>
          </section>
          <section className="overflow-hidden rounded-md border border-[#D6D8DF] bg-white"><h2 className="border-b border-[#D6D8DF] px-4 py-3 text-sm font-semibold">사용자</h2>
            {loading && <p className="p-4 text-sm text-slate-500">불러오는 중…</p>}
            <ul className="divide-y divide-slate-100">{users.map((user) => <li key={user.id}><button disabled={busy} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${selected?.id === user.id ? "bg-blue-50" : "hover:bg-slate-50"}`} onClick={() => { setSelected({ ...user, chatIds: [...user.chatIds] }); setQuery(""); setNotice(""); }}><span className="min-w-0"><span className="block truncate text-sm font-medium">{user.displayName}{user.id === actor.id ? " (나)" : ""}</span><span className="text-xs text-slate-500">{user.username}</span></span><span className="shrink-0 text-right text-xs leading-5 text-slate-500">{!user.active ? "비활성" : !user.ready ? "초대 대기" : user.role === "admin" ? "관리자" : "열람자"}<br/>{user.role === "admin" ? "전체 채팅방" : `${user.chatIds.length}개 채팅방`}</span></button></li>)}</ul>
          </section>
        </div>
        <section className="min-w-0 rounded-md border border-[#D6D8DF] bg-white p-4 md:p-5">
          {!selected ? <div className="py-16 text-center"><h2 className="text-sm font-medium">권한을 설정할 사용자를 선택해 주세요.</h2><p className="mt-2 text-xs text-slate-500">새 열람자는 채팅방을 지정하기 전까지 대화를 볼 수 없어요.</p></div> : <>
            <h2 className="break-words text-base font-semibold">{selected.displayName} 계정 설정</h2>
            <form className="mt-4 space-y-5" onSubmit={async (event) => { event.preventDefault(); const result = await mutate(selected); if (result) { setSelected(result.user); setNotice("계정과 조회 권한을 저장했어요."); } }}>
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">이름<input className="team-input mt-1" required maxLength={50} value={selected.displayName} onChange={(e) => setSelected({ ...selected, displayName: e.target.value })}/></label><label className="text-xs font-medium">역할<select className="team-input mt-1" disabled={selected.id === actor.id} value={selected.role} onChange={(e) => setSelected({ ...selected, role: e.target.value as TeamUser["role"] })}><option value="viewer">열람자</option><option value="admin">관리자</option></select></label></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={selected.id === actor.id} checked={selected.active} onChange={(e) => setSelected({ ...selected, active: e.target.checked })}/>계정 활성화</label>
              <div className="border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold">조회 가능한 채팅방</h3><p className="mt-1 text-xs leading-5 text-slate-500">{selected.role === "admin" ? "관리자는 모든 채팅방을 조회하고 설정·발송을 관리할 수 있어요." : "선택한 대화의 메시지·메모·요청·첨부와 검색·복사를 허용해요. 발송과 내용 변경은 허용하지 않아요."}</p>
                {selected.role === "viewer" && <><label className="mt-3 block text-xs">채팅방 검색<input className="team-input mt-1" value={query} onChange={(e) => setQuery(e.target.value)} /></label><div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><span className="font-medium">{selected.chatIds.length}개 선택</span><button type="button" className="text-[#2959AA]" onClick={() => setSelected({ ...selected, chatIds: [...new Set([...selected.chatIds, ...visibleChats.map((c) => c.id)])] })}>검색 결과 선택</button><button type="button" className="text-slate-600" onClick={() => setSelected({ ...selected, chatIds: [] })}>선택 해제</button></div><div className="mt-2 max-h-80 overflow-y-auto rounded border border-slate-200">
                  {visibleChats.length === 0 && <p className="p-4 text-sm text-slate-500">검색 결과가 없어요.</p>}
                  {visibleChats.map((chat) => <label key={chat.id} className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 hover:bg-slate-50"><input className="mt-1 shrink-0" type="checkbox" checked={selected.chatIds.includes(chat.id)} onChange={(e) => setSelected({ ...selected, chatIds: e.target.checked ? [...selected.chatIds, chat.id] : selected.chatIds.filter((id) => id !== chat.id) })}/><span className="min-w-0"><span className="block break-words text-sm">{chat.display_name || chat.id}</span><span className="text-xs text-slate-500">{chat.member_count}명 · {chat.category === "client" ? "고객" : chat.category === "casual" ? "잡담" : "미분류"}</span></span></label>)}
                  {missingGrants.map((id) => <label key={id} className="flex items-center gap-3 p-3 text-xs"><input type="checkbox" checked onChange={() => setSelected({ ...selected, chatIds: selected.chatIds.filter((value) => value !== id) })}/><span className="break-all">목록에 없는 채팅방 · {id}</span></label>)}
                </div></>}
              </div>
              <button disabled={busy} className="team-primary">{busy ? "저장 중…" : "계정·조회 권한 저장"}</button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4"><button disabled={busy || !selected.active || selected.id === actor.id} className="team-secondary disabled:opacity-40" onClick={async () => { if (!window.confirm("기존 비밀번호와 접속을 해제하고 초대 코드를 새로 발급할까요?")) return; const result = await mutate({ id: selected.id, action: "invite" }); if (result) { setInvite({ name: selected.displayName, token: result.token }); setSelected(null); } }}>비밀번호 재설정 코드</button><button disabled={busy || selected.id === actor.id} className="team-secondary disabled:opacity-40" onClick={async () => { const result = await mutate({ id: selected.id, action: "revoke" }); if (result) setNotice("해당 사용자의 모든 접속을 종료했어요."); }}>모든 접속 종료</button></div>
          </>}
        </section>
      </div>
      <section className="rounded-md border border-[#D6D8DF] bg-white p-4"><h2 className="text-sm font-semibold">최근 계정 활동</h2><ul className="mt-3 divide-y divide-slate-100">{events.filter((event) => actionLabels[event.action]).slice(0, 20).map((event, index) => <li key={index} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-xs"><span className="min-w-0 break-words">{event.actor || "시스템"} · {actionLabels[event.action] || event.action}{event.targetId && users.some((u) => u.id === event.targetId) ? ` · ${users.find((u) => u.id === event.targetId)?.displayName}` : ""}</span><time className="text-slate-500">{new Date(event.createdAt).toLocaleString("ko-KR")}</time></li>)}</ul></section>
    </div>
  </main>;
}
