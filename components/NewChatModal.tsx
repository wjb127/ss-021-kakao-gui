"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (id: string, name: string) => void;
}

export function NewChatModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setName(""); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/manual-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      const data = (await res.json()) as { id: string };
      onCreate(data.id, name.trim());
      onClose();
    } finally { setLoading(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-72 p-5 border border-[#D6D8DF]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[#1A1F36]">새 대화 추가</h2>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#1A1F36] text-lg leading-none">×</button>
        </div>
        <div className="text-[10px] text-[#9CA3AF] mb-2">크몽, 이메일 등 외부 채널 대화 관리용</div>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          placeholder="예: 크몽_홍길동"
          className="w-full text-sm px-3 py-2 border border-[#D6D8DF] rounded bg-[#F5F6F8] text-[#1A1F36] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2959AA] mb-3"
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || loading}
          className="w-full py-2 text-sm bg-[#2959AA] hover:bg-[#1D3F7A] disabled:bg-[#9CA3AF] text-white rounded transition-colors"
        >
          {loading ? "생성 중..." : "대화 생성"}
        </button>
      </div>
    </div>
  );
}
