"use client";

// 뷰 전환 드롭다운 — 햄버거 아이콘 클릭 시 인박스/카드/보드 선택
import { useEffect, useRef, useState } from "react";

type View = "inbox" | "card" | "board";

const VIEW_LABELS: Record<View, string> = {
  inbox: "인박스",
  card: "카드",
  board: "보드",
};

interface Props {
  current: View;
  onChange: (v: View) => void;
}

export function ViewSwitcher({ current, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 md:p-0 text-[#6B7280] hover:text-[#1A1F36] transition-colors"
        title="뷰 전환"
        aria-label="뷰 전환"
      >
        <svg className="w-6 h-6 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-[#D6D8DF] rounded shadow-md py-1 min-w-[110px]">
          {(["inbox", "card", "board"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { onChange(v); setOpen(false); }}
              className={`w-full text-left text-xs px-3 py-2 hover:bg-[#E8E9EC] transition-colors ${
                current === v ? "font-bold text-[#2959AA]" : "text-[#1A1F36]"
              }`}
            >
              {current === v ? "✓ " : "  "}{VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
