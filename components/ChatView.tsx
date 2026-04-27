"use client";

// 메시지 뷰 - 가운데 패널
import { useEffect, useRef, useState } from "react";
import type { Chat, Message } from "@/lib/types";

interface Props {
  chat: Chat | null;
  messages: Message[];
  loading: boolean;
  onRefresh: () => void;
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

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${mm}-${dd} ${hh}:${min}`;
  } catch {
    return "";
  }
}

function toPhotoFilename(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `photo_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
  } catch {
    return "photo.jpg";
  }
}

function toPlainText(messages: Message[]): string {
  const sorted = [...messages].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  return sorted
    .filter((m) => m.text?.trim())
    .map((m) => {
      const who = m.is_from_me ? "나" : `상대(${m.sender_id.slice(-4)})`;
      return `[${formatTimestamp(m.timestamp)}] ${who}: ${m.text}`;
    })
    .join("\n");
}

export function ChatView({ chat, messages, loading, onRefresh }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rawMode, setRawMode] = useState(false);
  const [copied, setCopied] = useState(false);

  const sorted = [...messages].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.id, messages.length]);

  // 채팅방 바뀌면 rawMode 초기화
  useEffect(() => {
    setRawMode(false);
  }, [chat?.id]);

  async function handleCopy() {
    const text = toPlainText(messages);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!chat) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950 text-gray-500 text-sm">
        왼쪽에서 채팅을 선택하세요
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-100 truncate">
            {(!chat.display_name || chat.display_name === "(unknown)")
            ? `(멤버 ${chat.member_count}명)`
            : chat.display_name}
          </div>
          <div className="text-[11px] text-gray-500">
            멤버 {chat.member_count}명 · 메시지 {sorted.length}개 ({chat.member_count <= 10 ? "50일" : "10일"})
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-gray-400 hover:text-gray-200 disabled:text-gray-600 transition-colors"
            title="메시지 새로고침"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setRawMode((v) => !v)}
            className={`text-[11px] px-2 py-1 rounded transition-colors ${
              rawMode
                ? "bg-yellow-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
            title="텍스트 뷰 (드래그 선택용)"
          >
            텍스트
          </button>
          <button
            onClick={handleCopy}
            className={`text-[11px] px-2 py-1 rounded transition-colors ${
              copied
                ? "bg-green-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
            title="전체 메시지 클립보드 복사"
          >
            {copied ? "복사됨" : "전체 복사"}
          </button>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-gray-500 text-xs py-8">
            메시지 로딩 중...
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center text-gray-500 text-xs py-8">
            메시지가 없습니다
          </div>
        ) : rawMode ? (
          /* 텍스트 뷰: 드래그 선택 쉬운 평문 */
          <pre className="p-4 text-xs text-gray-300 font-mono whitespace-pre-wrap break-words leading-5 select-all">
            {toPlainText(messages)}
          </pre>
        ) : (
          /* 말풍선 뷰 */
          <div className="px-4 py-3 space-y-2">
            {sorted.map((m, i) => {
              const prev = i > 0 ? sorted[i - 1] : null;
              const showDate =
                !prev || dateKey(prev.timestamp) !== dateKey(m.timestamp);
              const isSystem = m.type === "system";
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
                            {m.type === "photo" ? (
                              <span className="flex items-center gap-2">
                                <span>📷 사진</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(toPhotoFilename(m.timestamp));
                                  }}
                                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                    m.is_from_me
                                      ? "bg-blue-500 hover:bg-blue-400 text-blue-100"
                                      : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                                  }`}
                                  title={toPhotoFilename(m.timestamp)}
                                >
                                  파일명 복사
                                </button>
                              </span>
                            ) : (m.text || `[${m.type}]`)}
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
            })}
          </div>
        )}
      </div>
    </div>
  );
}
