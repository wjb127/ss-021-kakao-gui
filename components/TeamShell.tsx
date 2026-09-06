"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { TeamUser } from "@/lib/team-types";

const TeamContext = createContext<TeamUser | null>(null);
export function useTeamUser() { return useContext(TeamContext); }
export function useIsAdmin() { return useTeamUser()?.role === "admin"; }

export function TeamShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicPage = pathname === "/login";
  const [user, setUser] = useState<TeamUser | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (publicPage) return;
    let disposed = false;
    let signature: string | null = null;
    const check = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (response.status === 401) { window.location.replace("/login"); return; }
        if (!response.ok) throw new Error("session");
        const data = await response.json() as { user: TeamUser };
        if (disposed) return;
        const next = `${data.user.id}:${data.user.revision}`;
        // 권한이 바뀌면 메모리의 대화·검색 캐시까지 함께 비운다.
        if (signature && signature !== next) { window.location.reload(); return; }
        signature = next;
        setUser(data.user); setError(false);
      } catch { if (!disposed) { setUser(null); setError(true); } }
    };
    void check();
    const timer = window.setInterval(check, 15_000);
    const focus = () => { void check(); };
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener("focus", focus); window.removeEventListener("pageshow", focus); };
  }, [publicPage]);

  if (publicPage) return children;
  if (!user) return <main className="flex min-h-dvh items-center justify-center p-6 text-sm text-slate-600"><div role="status">{error ? "연결을 확인하고 다시 시도해 주세요." : "로그인 확인 중…"}{error && <button className="ml-3 text-blue-700 underline" onClick={() => window.location.reload()}>다시 시도</button>}</div></main>;
  return <TeamContext.Provider value={user}>
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[#D6D8DF] bg-white px-3 text-xs">
        <Link href="/" className="shrink-0 font-semibold text-[#1A1F36]">카카오 인박스</Link>
        <nav aria-label="계정 메뉴" className="flex min-w-0 items-center gap-3">
          <Link href="/account" title={user.displayName} className="shrink-0 font-medium text-[#2959AA]">내 계정</Link>
          {user.role === "admin" ? <a className="shrink-0 font-medium text-[#2959AA]" href="/admin">팀 관리</a> : <span className="shrink-0 text-slate-500">열람자</span>}
          <button className="shrink-0 text-slate-600" onClick={async () => {
            const response = await fetch("/api/auth/logout", { method: "POST" });
            if (response.ok || response.status === 401) window.location.replace("/login");
            else setError(true);
          }}>로그아웃</button>
        </nav>
      </header>
      <div className={`team-workspace min-h-0 flex-1 overflow-hidden ${user.role === "viewer" ? "team-viewer" : ""}`}>{children}</div>
    </div>
  </TeamContext.Provider>;
}
