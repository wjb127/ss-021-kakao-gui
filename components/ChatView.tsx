"use client";

// 메시지 뷰 - 가운데 패널
import { useEffect, useRef, useState } from "react";
import type { Chat, Message } from "@/lib/types";
import { parseKmong } from "@/lib/kmong-parser";

interface Props {
  chat: Chat | null;
  messages: Message[];
  loading: boolean;
  onRefresh: () => void;
  onRestore?: () => void;
  onBack?: () => void;
  onOpenAI?: () => void;
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

async function openLocalFile(path: string): Promise<string | null> {
  try {
    const res = await fetch("/api/open-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      return data.error || "열기 실패";
    }
    return null;
  } catch (e) {
    return String(e);
  }
}

async function revealLocalFile(path: string): Promise<string | null> {
  try {
    const res = await fetch("/api/open-file", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      return data.error || "Finder 표시 실패";
    }
    return null;
  } catch (e) {
    return String(e);
  }
}

function MediaMessage({
  message,
  isFromMe,
}: {
  message: Message;
  isFromMe: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [localPath, setLocalPath] = useState<string | undefined>(message.localFilePath);
  const icon = message.type === "video" ? "🎥" : message.type === "file" ? "📎" : "📷";
  const label = message.type === "video" ? "동영상" : message.type === "file" ? "파일" : "사진";
  const filename = localPath ? localPath.split("/").pop() : null;
  const hasUrl = !!message.attachment?.url;

  async function handleOpen() {
    if (!localPath) return;
    const err = await openLocalFile(localPath);
    if (err) setError(err);
    else setError(null);
  }

  async function handleReveal() {
    if (!localPath) return;
    const err = await revealLocalFile(localPath);
    if (err) setError(err);
    else setError(null);
  }

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/download-attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: message.chat_id,
          messageId: message.id,
        }),
      });
      const data = (await res.json()) as { path?: string; error?: string };
      if (!res.ok || !data.path) {
        setError(data.error || "다운로드 실패");
        return;
      }
      setLocalPath(data.path);
      // 다운 직후 자동 열기
      await openLocalFile(data.path);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
    }
  }

  const btnBase = isFromMe
    ? "bg-[#1D3F7A] hover:bg-[#163266] text-blue-100"
    : "bg-[#E8E9EC] hover:bg-[#D6D8DF] text-[#1A1F36]";

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2 flex-wrap">
        <span>{icon} {label}</span>
        {localPath ? (
          <>
            <button
              onClick={handleOpen}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${btnBase}`}
              title={localPath}
            >
              열기
            </button>
            <button
              onClick={handleReveal}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${btnBase}`}
              title="Finder에서 보기"
            >
              폴더
            </button>
          </>
        ) : hasUrl ? (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${btnBase} disabled:opacity-60`}
            title="CDN 에서 직접 다운로드"
          >
            {downloading ? "다운중…" : "다운로드"}
          </button>
        ) : (
          <span className={`text-[10px] ${isFromMe ? "text-blue-200" : "text-[#9CA3AF]"}`}>
            (URL 만료/없음)
          </span>
        )}
      </span>
      {filename && (
        <span className={`text-[10px] ${isFromMe ? "text-blue-200" : "text-[#6B7280]"} truncate max-w-[280px]`}>
          {filename}
        </span>
      )}
      {error && (
        <span className="text-[10px] text-red-300">{error}</span>
      )}
    </div>
  );
}

function toPlainText(messages: Message[]): string {
  const sorted = [...messages].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  return sorted
    .filter((m) => m.text?.trim() || m.type === "photo" || m.type === "video" || m.type === "file")
    .map((m) => {
      const who = m.is_from_me ? "나" : `상대(${m.sender_id.slice(-4)})`;
      let text = m.text;
      if (m.type === "photo") text = `[사진: ${toPhotoFilename(m.timestamp)}]`;
      else if (m.type === "video") text = `[동영상]`;
      else if (m.type === "file") text = `[파일]`;
      return `[${formatTimestamp(m.timestamp)}] ${who}: ${text}`;
    })
    .join("\n");
}

export function ChatView({ chat, messages, loading, onRefresh, onRestore, onBack, onOpenAI }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rawMode, setRawMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualSending, setManualSending] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const isManual = !!chat?.id?.startsWith("manual_");

  async function handleManualSend(mode: "replace" | "append") {
    if (!chat || !manualInput.trim() || manualSending) return;

    // 옵티미스틱: 클라사이드 미리 파싱해서 검증 (실패하면 서버 호출 전 차단)
    const text = manualInput.trim();
    const preview = parseKmong(text);
    if (preview.length === 0) {
      setManualError("파싱 가능한 메시지가 없습니다 (크몽 포맷 확인)");
      return;
    }

    // replace 는 위험 작업 → 한 번 확인
    if (mode === "replace") {
      const ok = window.confirm(
        `기존 메시지를 모두 삭제하고 ${preview.length}개로 새로 파싱합니다. 계속할까요?`,
      );
      if (!ok) return;
    }

    setManualSending(true);
    setManualError(null);
    setManualInput(""); // 입력창 즉시 비움 (옵티미스틱)

    try {
      const res = await fetch("/api/parse-kmong", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          rawText: text,
          mode,
        }),
      });
      const data = (await res.json()) as { count?: number; error?: string; skipped?: number };
      if (!res.ok) {
        setManualError(data.error || "파싱 실패");
        setManualInput(text); // 실패 시 입력 복구
        return;
      }
      onRefresh();
    } catch (e) {
      setManualError(String(e));
      setManualInput(text);
    } finally {
      setManualSending(false);
    }
  }

  const sorted = [...messages].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.id, messages.length]);

  // 채팅방 바뀌면 rawMode/입력 초기화
  useEffect(() => {
    setRawMode(false);
    setManualInput("");
    setManualError(null);
  }, [chat?.id]);

  async function handleCopy() {
    const text = toPlainText(messages);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!chat) {
    return (
      <div className="flex w-full h-full items-center justify-center bg-[#F5F6F8] text-[#6B7280] text-sm">
        왼쪽에서 채팅을 선택하세요
      </div>
    );
  }

  return (
    /* 메시지 영역 전체: 30% 서피스 #F5F6F8 */
    <div className="flex flex-col h-full w-full min-w-0 bg-[#F5F6F8]">
      {/* 헤더: 흰 배경, 하단 보더 */}
      <div className="px-4 py-3 border-b border-[#D6D8DF] bg-white flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          {/* 모바일 뒤로가기 */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden p-1 -ml-1 text-[#6B7280] hover:text-[#1A1F36] transition-colors"
              title="뒤로"
              aria-label="뒤로가기"
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="min-w-0">
            <div className="text-base md:text-sm font-semibold text-[#1A1F36] truncate">
              {(!chat.display_name || chat.display_name === "(unknown)")
              ? `(멤버 ${chat.member_count}명)`
              : chat.display_name}
            </div>
            <div className="text-xs md:text-[11px] text-[#6B7280]">
              멤버 {chat.member_count}명 · 메시지 {sorted.length}개 ({chat.member_count <= 10 ? "50일" : "10일"})
            </div>
          </div>
        </div>
        <div className="flex gap-1 md:gap-1.5 shrink-0 items-center">
          {/* 모바일 AI 패널 열기 */}
          {onOpenAI && (
            <button
              onClick={onOpenAI}
              className="md:hidden text-sm px-3 py-1.5 rounded bg-[#2959AA] text-white hover:bg-[#1F4485] transition-colors font-medium"
              title="AI 패널"
            >
              AI
            </button>
          )}
          {/* 새로고침 버튼 */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 md:p-0 text-[#6B7280] hover:text-[#1A1F36] disabled:text-[#9CA3AF] transition-colors"
            title="메시지 새로고침"
            aria-label="새로고침"
          >
            <svg
              className={`w-5 h-5 md:w-3.5 md:h-3.5 ${loading ? "animate-spin text-[#2959AA]" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {/* 텍스트 뷰 토글 — 데스크탑 전용 */}
          <button
            onClick={() => setRawMode((v) => !v)}
            className={`hidden md:inline-flex text-[11px] px-2 py-1 rounded transition-colors ${
              rawMode
                ? "bg-yellow-400 text-yellow-900"
                : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
            }`}
            title="텍스트 뷰 (드래그 선택용)"
          >
            텍스트
          </button>
          {/* 대화 복원 버튼 — 데스크탑 전용 */}
          {onRestore && (
            <button
              onClick={onRestore}
              className="hidden md:inline-flex text-[11px] px-2 py-1 rounded transition-colors bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
              title="외부 대화 붙여넣기로 복원"
            >
              대화복원
            </button>
          )}
          {/* 전체 복사 버튼 */}
          <button
            onClick={handleCopy}
            className={`text-xs md:text-[11px] px-2.5 py-1.5 md:px-2 md:py-1 rounded transition-colors ${
              copied
                ? "bg-green-500 text-white"
                : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
            }`}
            title="전체 메시지 클립보드 복사"
          >
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      </div>

      {/* 메시지 스크롤 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-[#6B7280] text-xs py-8">
            <div className="inline-block w-5 h-5 border-2 border-[#D6D8DF] border-t-[#2959AA] rounded-full animate-spin mb-2" />
            <div>메시지 로딩 중...</div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center text-[#6B7280] text-xs py-8">
            메시지가 없습니다
          </div>
        ) : rawMode ? (
          /* 텍스트 뷰: 드래그 선택 쉬운 평문 */
          <pre className="p-4 text-xs text-[#1A1F36] font-mono whitespace-pre-wrap break-words leading-5 select-all">
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
                  {/* 날짜 구분선 */}
                  {showDate && (
                    <div className="text-center my-3">
                      <span className="text-[10px] text-[#6B7280] bg-[#E8E9EC] px-2 py-0.5 rounded">
                        {formatDateLabel(m.timestamp)}
                      </span>
                    </div>
                  )}
                  {/* 시스템 메시지 */}
                  {isSystem ? (
                    <div className="text-center my-1">
                      <span className="text-[10px] text-[#9CA3AF]">
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
                        {/* 발신자 표시 */}
                        {showSender && (
                          <div className="text-[10px] text-[#6B7280] mb-0.5 ml-1">
                            {m.sender_id.slice(-6)}
                          </div>
                        )}
                        {/* 말풍선: 내 메시지=#2959AA, 상대=흰색 */}
                        <div
                          className={`px-3 py-1.5 rounded-lg text-sm ${
                            m.is_from_me
                              ? "bg-[#2959AA] text-white rounded-br-sm"
                              : "bg-white text-[#1A1F36] border border-gray-200 rounded-bl-sm"
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words">
                            {m.type === "photo" || m.type === "video" || m.type === "file" ? (
                              <MediaMessage message={m} isFromMe={m.is_from_me} />
                            ) : (m.text || `[${m.type}]`)}
                          </div>
                          {/* 타임스탬프 */}
                          <div
                            className={`text-[9px] mt-0.5 ${
                              m.is_from_me ? "text-blue-200" : "text-[#9CA3AF]"
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

      {/* 임의 생성 채팅(manual_*) 전용 하단 입력창 — Claude로 파싱하여 메시지로 변환 */}
      {isManual && (
        <div className="border-t border-[#D6D8DF] bg-white px-3 py-2 shrink-0">
          {manualError && (
            <div className="mb-1 text-[10px] text-red-500">{manualError}</div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter = 채팅추가파싱(append). Shift+Enter는 줄바꿈. IME 조합중 무시
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleManualSend("append");
                }
              }}
              placeholder="크몽 채팅 붙여넣기 (Enter=추가파싱, Shift+Enter=줄바꿈)"
              rows={2}
              className="flex-1 text-xs text-[#1A1F36] bg-[#F5F6F8] rounded px-2 py-1.5 resize-none focus:outline-none focus:bg-white focus:border focus:border-[#2959AA] placeholder-[#9CA3AF] leading-[1.4] min-h-[40px] max-h-[160px]"
              disabled={manualSending}
            />
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={() => handleManualSend("append")}
                disabled={!manualInput.trim() || manualSending}
                className="px-3 py-1.5 text-xs bg-[#2959AA] hover:bg-[#1D3F7A] disabled:bg-[#9CA3AF] text-white rounded transition-colors"
                title="기존 메시지 뒤에 새 메시지만 추가"
              >
                {manualSending ? "파싱중…" : "추가파싱"}
              </button>
              <button
                onClick={() => handleManualSend("replace")}
                disabled={!manualInput.trim() || manualSending}
                className="px-3 py-1.5 text-xs bg-[#E8E9EC] hover:bg-[#D6D8DF] disabled:bg-[#F5F6F8] text-[#1A1F36] rounded transition-colors border border-[#D6D8DF]"
                title="기존 메시지 전부 삭제하고 새로 파싱"
              >
                새로파싱
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
