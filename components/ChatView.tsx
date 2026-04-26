"use client";

// 메시지 뷰 - 가운데 패널
import { useEffect, useRef } from "react";
import type { Chat, Message } from "@/lib/types";

interface Props {
  chat: Chat | null;
  messages: Message[];
  loading: boolean;
}

function dateKey(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  } catch {
    return "";
  }
}

function formatDateLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  } catch {
    return "";
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

export function ChatView({ chat, messages, loading }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 시간 오름차순 정렬
  const sorted = [...messages].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  useEffect(() => {
    // 로드 후 맨 아래로 스크롤
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chat?.id, messages.length]);

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950 text-gray-500 text-sm">
        왼쪽에서 채팅을 선택하세요
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-950">
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900">
        <div className="text-sm font-semibold text-gray-100">
          {chat.display_name}
        </div>
        <div className="text-[11px] text-gray-500">
          멤버 {chat.member_count}명 · 메시지 {sorted.length}개 (10일)
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="text-center text-gray-500 text-xs py-8">
            메시지 로딩 중...
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-8">
            메시지가 없습니다
          </div>
        ) : (
          sorted.map((m, i) => {
            const prev = i > 0 ? sorted[i - 1] : null;
            const showDate =
              !prev || dateKey(prev.timestamp) !== dateKey(m.timestamp);
            const isSystem =
              m.type !== "text" && m.type !== "image" && m.type !== "photo";
            const showSender =
              !m.is_from_me &&
              !isSystem &&
              (!prev ||
                prev.sender_id !== m.sender_id ||
                prev.is_from_me !== m.is_from_me);

            return (
              <div key={m.id}>
                {showDate && (
                  <div className="text-center my-3">
                    <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                      {formatDateLabel(m.timestamp)}
                    </span>
                  </div>
                )}
                {isSystem ? (
                  <div className="text-center my-1">
                    <span className="text-[10px] text-gray-600">
                      {m.text || `[${m.type}]`}
                    </span>
                  </div>
                ) : (
                  <div
                    className={`flex ${
                      m.is_from_me ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div className="max-w-[70%]">
                      {showSender && (
                        <div className="text-[10px] text-gray-500 mb-0.5 ml-1">
                          {m.sender_id.slice(-6)}
                        </div>
                      )}
                      <div
                        className={`px-3 py-1.5 rounded-lg text-sm ${
                          m.is_from_me
                            ? "bg-blue-600 text-white rounded-br-sm"
                            : "bg-gray-800 text-gray-100 rounded-bl-sm"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">
                          {m.text || `[${m.type}]`}
                        </div>
                        <div
                          className={`text-[9px] mt-0.5 ${
                            m.is_from_me ? "text-blue-200" : "text-gray-500"
                          }`}
                        >
                          {formatTime(m.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
