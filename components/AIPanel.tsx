"use client";

// AI 분석 패널 - 우측
import { useEffect, useState } from "react";
import type { Analysis, Chat, Urgency } from "@/lib/types";

interface Props {
  chat: Chat | null;
}

// 긴급도 배지 — 라이트 테마에 맞춰 조정
const URGENCY_STYLE: Record<Urgency, string> = {
  Low:      "bg-[#E8E9EC] text-[#6B7280]",
  Medium:   "bg-yellow-100 text-yellow-800 border border-yellow-300",
  High:     "bg-orange-100 text-orange-800 border border-orange-300",
  Critical: "bg-red-100 text-red-700 border border-red-300",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR");
  } catch {
    return iso;
  }
}

export function AIPanel({ chat }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedSet, setCheckedSet] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // 채팅 변경 시 저장된 분석 로드
  useEffect(() => {
    setError(null);
    setCheckedSet(new Set());
    if (!chat || chat.category !== "client") {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/todos?chatId=${encodeURIComponent(chat.id)}`,
        );
        const data = (await res.json()) as Analysis | null;
        if (!cancelled) setAnalysis(data || null);
      } catch {
        if (!cancelled) setAnalysis(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chat?.id, chat?.category]);

  async function runAnalyze() {
    if (!chat) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "분석 실패");
      } else {
        setAnalysis(data as Analysis);
        setCheckedSet(new Set());
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!chat) {
    return (
      /* AI 패널: 흰 배경, 좌측 보더 #D6D8DF */
      <div className="w-full h-full bg-white border-l border-[#D6D8DF] p-4 text-xs text-[#6B7280]">
        채팅을 선택하면 AI 분석이 표시됩니다
      </div>
    );
  }

  if (chat.category !== "client") {
    return (
      <div className="w-full h-full bg-white border-l border-[#D6D8DF] p-4">
        <div className="text-xs text-[#6B7280]">
          AI 분석은 <span className="text-[#2959AA] font-medium">고객</span> 카테고리 채팅에만
          제공됩니다
        </div>
        <div className="text-[10px] text-[#9CA3AF] mt-2">
          왼쪽 채팅 옆 배지를 클릭해서 카테고리를 [고객]으로 변경하세요
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white border-l border-[#D6D8DF] flex flex-col">
      {/* 패널 헤더 */}
      <div className="p-3 border-b border-[#D6D8DF] bg-white">
        <h2 className="text-sm font-bold text-[#1A1F36]">AI 분석</h2>
        <div className="text-[10px] text-[#6B7280] truncate">
          {chat.display_name}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 분석 시작 버튼 */}
        {!analysis && !loading && (
          <button
            onClick={runAnalyze}
            className="w-full py-2 bg-[#2959AA] hover:bg-[#1D3F7A] text-white text-sm rounded transition-colors"
          >
            AI 분석하기
          </button>
        )}

        {/* 로딩 스피너 */}
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block w-6 h-6 border-2 border-[#D6D8DF] border-t-[#2959AA] rounded-full animate-spin" />
            <div className="text-xs text-[#6B7280] mt-2">분석 중...</div>
          </div>
        )}

        {/* 에러: 라이트 레드 */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}

        {analysis && !loading && (
          <>
            {/* 요약 */}
            <div>
              <div className="text-[10px] text-[#6B7280] mb-1">요약</div>
              <div className="text-sm text-[#1A1F36] bg-[#F5F6F8] border border-[#D6D8DF] rounded p-2">
                {analysis.summary}
              </div>
            </div>

            {/* 긴급도 */}
            <div>
              <div className="text-[10px] text-[#6B7280] mb-1">긴급도</div>
              <span
                className={`inline-block text-xs font-semibold px-2 py-1 rounded ${URGENCY_STYLE[analysis.urgency]}`}
              >
                {analysis.urgency}
              </span>
            </div>

            {/* 다음 액션 */}
            {analysis.nextAction && (
              <div>
                <div className="text-[10px] text-[#6B7280] mb-1">다음 액션</div>
                <div className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-2 font-medium">
                  {analysis.nextAction}
                </div>
              </div>
            )}

            {/* TODO 체크리스트 */}
            {analysis.todos.length > 0 && (
              <div>
                <div className="text-[10px] text-[#6B7280] mb-1">
                  TODO ({analysis.todos.length})
                </div>
                <ul className="space-y-1">
                  {analysis.todos.map((t, i) => {
                    const checked = checkedSet.has(i);
                    return (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-xs text-[#1A1F36] bg-[#F5F6F8] border border-[#D6D8DF] rounded p-2"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(checkedSet);
                            if (checked) next.delete(i);
                            else next.add(i);
                            setCheckedSet(next);
                          }}
                          className="mt-0.5 shrink-0 accent-[#2959AA]"
                        />
                        <span
                          className={
                            checked ? "line-through text-[#9CA3AF]" : ""
                          }
                        >
                          {t}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 하단: 분석 시각 + 재분석 버튼 */}
            <div className="pt-2 border-t border-[#D6D8DF] flex items-center justify-between">
              <span className="text-[10px] text-[#9CA3AF]">
                {formatTimestamp(analysis.analyzedAt)}
              </span>
              <button
                onClick={runAnalyze}
                className="text-[10px] px-2 py-1 bg-[#E8E9EC] hover:bg-[#D6D8DF] text-[#1A1F36] rounded transition-colors"
              >
                재분석
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
