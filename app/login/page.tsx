"use client";

import { useState } from "react";

export default function LoginPage() {
  const [activate, setActivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <main className="flex h-dvh items-center justify-center overflow-y-auto bg-[#F5F6F8] px-5 py-8">
    <section className="w-full max-w-sm rounded-lg border border-[#D6D8DF] bg-white p-6 shadow-sm">
      <p className="mb-6 text-sm font-semibold text-[#2959AA]">카카오 인박스</p>
      <h1 className="text-xl font-semibold">{activate ? "계정 시작하기" : "팀 계정 로그인"}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">{activate ? "관리자에게 받은 초대 코드로 비밀번호를 설정해 주세요." : "허용된 고객 대화와 요청을 확인하세요."}</p>
      <form className="mt-6 space-y-4" onSubmit={async (event) => {
        event.preventDefault(); setBusy(true); setError("");
        const data = new FormData(event.currentTarget);
        if (activate && data.get("password") !== data.get("confirm")) { setError("비밀번호가 일치하지 않아요."); setBusy(false); return; }
        try {
          const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(data)) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          window.location.replace("/");
        } catch (err) { setError(err instanceof Error ? err.message : "연결을 확인해 주세요."); }
        finally { setBusy(false); }
      }}>
        <label className="block text-sm font-medium">{activate ? "초대 코드" : "아이디"}<input key={String(activate)} name={activate ? "token" : "username"} type={activate ? "password" : "text"} autoComplete={activate ? "off" : "username"} required maxLength={activate ? 100 : 32} className="team-input mt-1.5" /></label>
        <label className="block text-sm font-medium">비밀번호<input name="password" type="password" autoComplete={activate ? "new-password" : "current-password"} required minLength={activate ? 12 : 1} maxLength={128} className="team-input mt-1.5" /></label>
        {activate && <><p className="text-xs text-slate-500">12자 이상으로 설정해 주세요. 초대 코드는 24시간 동안 한 번 사용할 수 있어요.</p><label className="block text-sm font-medium">비밀번호 확인<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="team-input mt-1.5" /></label></>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="team-primary w-full">{busy ? "확인 중…" : activate ? "비밀번호 설정하고 시작" : "로그인"}</button>
      </form>
      <button className="mt-5 text-sm text-[#2959AA]" onClick={() => { setActivate(!activate); setError(""); }}>{activate ? "로그인으로 돌아가기" : "초대 코드로 계정 시작"}</button>
    </section>
  </main>;
}
