"use client";

// AI 분석 패널 - 우측
import { useEffect, useState } from "react";
import type { Analysis, Chat, Urgency } from "@/lib/types";

interface Props {
  chat: Chat | null;
}

const URGENCY_STYLE: Record<Urgency, string> = {
  Low: "bg-gray-600 text-gray-100",
  Medium: "bg-yellow-600 text-white",
  High: "bg-orange-600 text-white",
  Critical: "bg-red-600 text-white",
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
      <div className="w-full h-full bg-gray-900 border-l border-gray-800 p-4 text-xs text-gray-500">
        채팅을 선택하면 AI 분석이 표시됩니다
      </div>
    );
  }

  if (chat.category !== "client") {
    return (
      <div className="w-full h-full bg-gray-900 border-l border-gray-800 p-4">
        <div className="text-xs text-gray-500">
          AI 분석은 <span className="text-blue-400">고객</span> 카테고리 채팅에만
          제공됩니다
        </div>
        <div className="text-[10px] text-gray-600 mt-2">
          왼쪽 채팅 옆 배지를 클릭해서 카테고리를 [고객]으로 변경하세요
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-900 border-l border-gray-800 flex flex-col">
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-bold text-gray-200">AI 분석</h2>
        <div className="text-[10px] text-gray-500 truncate">
          {chat.display_name}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!analysis && !loading && (
          <button
            onClick={runAnalyze}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          >
            AI 분석하기
          </button>
        )}

        {loading && (
          <div className="text-center py-8">
            <div className="inline-block w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            <div className="text-xs text-gray-500 mt-2">분석 중...</div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-950 border border-red-900 rounded p-2">
            {error}
          </div>
        )}

        {analysis && !loading && (
          <>
            <div>
              <div className="text-[10px] text-gray-500 mb-1">요약</div>
              <div className="text-sm text-gray-100 bg-gray-800 rounded p-2">
                {analysis.summary}
              </div>
            </div>

            <div>
              <div className="text-[10px] text-gray-500 mb-1">긴급도</div>
              <span
                className={`inline-block text-xs font-semibold px-2 py-1 rounded ${URGENCY_STYLE[analysis.urgency]}`}
              >
                {analysis.urgency}
              </span>
            </div>

            {analysis.nextAction && (
              <div>
                <div className="text-[10px] text-gray-500 mb-1">다음 액션</div>
                <div className="text-sm text-yellow-200 bg-yellow-950 border border-yellow-800 rounded p-2 font-medium">
                  {analysis.nextAction}
                </div>
              </div>
            )}

            {analysis.todos.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-500 mb-1">
                  TODO ({analysis.todos.length})
                </div>
                <ul className="space-y-1">
                  {analysis.todos.map((t, i) => {
                    const checked = checkedSet.has(i);
                    return (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-xs text-gray-200 bg-gray-800 rounded p-2"
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
                          className="mt-0.5 shrink-0"
                        />
                        <span
                          className={
                            checked ? "line-through text-gray-500" : ""
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

            <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
              <span className="text-[10px] text-gray-500">
                {formatTimestamp(analysis.analyzedAt)}
              </span>
              <button
                onClick={runAnalyze}
                className="text-[10px] px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded"
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
