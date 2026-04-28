"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  chatId: string;
  chatName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RestoreModal({ open, chatId, chatName, onClose, onSuccess }: Props) {
  const [rawText, setRawText] = useState("");
  const [isAppend, setIsAppend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setRawText("");
      setResult(null);
      setIsAppend(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleRestore() {
    if (!rawText.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/restore-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, rawText, isAppend }),
      });
      const data = (await res.json()) as { count?: number; error?: string };
      if (!res.ok) {
        setResult(`오류: ${data.error || "복원 실패"}`);
      } else {
        setResult(`${data.count}개 메시지 복원됨`);
        onSuccess();
      }
    } catch (e) {
      setResult(`오류: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-[480px] p-5 border border-[#D6D8DF] flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-[#1A1F36]">대화 복원</h2>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#1A1F36] text-lg leading-none">×</button>
        </div>
        <div className="text-[10px] text-[#9CA3AF] mb-3">
          {chatName} — 크몽, 이메일 등 외부 대화를 붙여넣으면 AI가 파싱해서 저장합니다
        </div>

        {/* 추가 모드 토글 */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setIsAppend(false)}
            className={`flex-1 py-1.5 text-xs rounded transition-colors ${
              !isAppend ? "bg-[#2959AA] text-white" : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
            }`}
          >
            새로 복원
          </button>
          <button
            onClick={() => setIsAppend(true)}
            className={`flex-1 py-1.5 text-xs rounded transition-colors ${
              isAppend ? "bg-[#2959AA] text-white" : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
            }`}
          >
            이어서 추가
          </button>
        </div>

        <div className="text-[10px] text-[#9CA3AF] mb-1.5">
          {isAppend ? "기존 메시지 이후로 이어서 저장" : "새 대화로 저장 (기존 메시지와 별개)"}
        </div>

        {/* 텍스트 붙여넣기 */}
        <textarea
          ref={textareaRef}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={`구매자: 안녕하세요, 로고 디자인 문의드립니다\n판매자: 네 안녕하세요! 어떤 스타일 원하시나요?\n구매자: 심플하게요`}
          className="flex-1 w-full min-h-[200px] text-xs text-[#1A1F36] bg-[#F5F6F8] border border-[#D6D8DF] rounded p-3 resize-none focus:outline-none focus:border-[#2959AA] placeholder-[#C8CAD1] leading-5 mb-3 font-mono"
        />

        {result && (
          <div className={`text-xs rounded p-2 mb-3 ${
            result.startsWith("오류")
              ? "text-red-600 bg-red-50 border border-red-200"
              : "text-green-700 bg-green-50 border border-green-200"
          }`}>
            {result}
          </div>
        )}

        <button
          onClick={handleRestore}
          disabled={!rawText.trim() || loading}
          className="w-full py-2 text-sm bg-[#2959AA] hover:bg-[#1D3F7A] disabled:bg-[#9CA3AF] text-white rounded transition-colors"
        >
          {loading ? "AI 파싱 중..." : "복원하기"}
        </button>
      </div>
    </div>
  );
}
