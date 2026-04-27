"use client";

// 설정 모달
import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultView: "inbox" | "board";
  onDefaultViewChange: (v: "inbox" | "board") => void;
  defaultFilter: "all" | "client" | "casual";
  onDefaultFilterChange: (f: "all" | "client" | "casual") => void;
}

export function SettingsModal({
  open,
  onClose,
  defaultView,
  onDefaultViewChange,
  defaultFilter,
  onDefaultFilterChange,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        ref={ref}
        className="bg-white rounded-xl shadow-xl w-80 p-5 border border-[#D6D8DF]"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[#1A1F36]">설정</h2>
          <button
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-[#1A1F36] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* 기본 뷰 */}
          <div>
            <div className="text-xs font-medium text-[#1A1F36] mb-1.5">기본 뷰</div>
            <div className="flex gap-1.5">
              {(["inbox", "board"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onDefaultViewChange(v)}
                  className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                    defaultView === v
                      ? "bg-[#2959AA] text-white"
                      : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
                  }`}
                >
                  {v === "inbox" ? "인박스" : "보드"}
                </button>
              ))}
            </div>
          </div>

          {/* 기본 필터 */}
          <div>
            <div className="text-xs font-medium text-[#1A1F36] mb-1.5">기본 필터</div>
            <div className="flex gap-1.5">
              {(["all", "client", "casual"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => onDefaultFilterChange(f)}
                  className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                    defaultFilter === f
                      ? "bg-[#2959AA] text-white"
                      : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
                  }`}
                >
                  {f === "all" ? "전체" : f === "client" ? "고객" : "잡담"}
                </button>
              ))}
            </div>
          </div>

          {/* 앱 정보 */}
          <div className="pt-3 border-t border-[#E8E9EC]">
            <div className="text-[10px] text-[#9CA3AF] space-y-0.5">
              <div>카카오 인박스 GUI v0.1</div>
              <div>DB: ~/.kakaocli/kakao-gui.db</div>
              <div>포트: 3032</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
