"use client";

import { useState, type FormEvent } from "react";
import { useTeamUser } from "@/components/TeamShell";

export default function AccountPage() {
  const user = useTeamUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess(false);
    if (newPassword !== confirmPassword) { setError("새 비밀번호가 일치하지 않아요."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      if (response.status === 401) { window.location.replace("/login"); return; }
      const result = await response.json();
      if (!response.ok) { setError(result.error || "비밀번호를 변경하지 못했어요."); return; }
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setSuccess(true);
    } catch { setError("연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <main className="h-full overflow-y-auto bg-[#F7F8FA] px-5 py-7 sm:px-8">
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-[#1A1F36]">내 계정</h1>
      <dl className="my-6 grid grid-cols-[5rem_1fr] gap-3 border-y border-slate-200 py-4 text-sm">
        <dt className="text-slate-500">아이디</dt><dd className="break-all">{user?.username}</dd>
        <dt className="text-slate-500">이름</dt><dd className="break-all">{user?.displayName}</dd>
      </dl>
      <h2 className="text-base font-semibold">비밀번호 변경</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">새 비밀번호는 12~128자로 입력해 주세요. 변경하면 다른 기기에서는 다시 로그인해야 해요.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-sm">현재 비밀번호<input className="team-input mt-2 w-full" type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={busy} /></label>
        <label className="block text-sm">새 비밀번호<input className="team-input mt-2 w-full" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={busy} /></label>
        <label className="block text-sm">새 비밀번호 확인<input className="team-input mt-2 w-full" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={busy} /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="text-sm text-green-800">비밀번호를 변경했어요. 다른 기기의 로그인은 해제됐어요.</p>}
        <button className="team-primary w-full sm:w-auto" disabled={busy}>{busy ? "변경 중…" : "비밀번호 변경"}</button>
      </form>
    </div>
  </main>;
}
