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
  onAttachmentDownloaded?: (messageId: string, filePath: string) => void;
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

function isMediaMessage(message: Message): boolean {
  return message.type === "photo" ||
    message.type === "video" ||
    message.type === "file" ||
    !!message.attachment?.url ||
    (Array.isArray(message.attachment?.imageUrls) && message.attachment.imageUrls.length > 0);
}

function mediaLabel(type: string): string {
  if (type === "video") return "동영상";
  if (type === "file") return "파일";
  return "사진";
}

function attachmentUrlCount(message: Message): number {
  if (Array.isArray(message.attachment?.imageUrls) && message.attachment.imageUrls.length > 0) {
    return message.attachment.imageUrls.length;
  }
  return message.attachment?.url ? 1 : 0;
}

function hasDownloadUrl(message: Message): boolean {
  return attachmentUrlCount(message) > 0;
}

function replyPreview(message: Message): string {
  const reply = message.reply;
  if (!reply) return "";
  if (reply.text.trim()) return reply.text.trim();
  if (reply.type === 2 || reply.type === 27) return "[사진]";
  if (reply.type === 3) return "[동영상]";
  if (reply.type === 18) return "[파일]";
  return "[메시지]";
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

async function copyText(text: string): Promise<string | null> {
  try {
    await navigator.clipboard.writeText(text);
    return null;
  } catch (e) {
    return String(e);
  }
}

function MediaMessage({
  message,
  isFromMe,
  onDownloaded,
}: {
  message: Message;
  isFromMe: boolean;
  onDownloaded?: (messageId: string, filePath: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [optimisticPath, setOptimisticPath] = useState<string | undefined>();
  const [copiedPath, setCopiedPath] = useState(false);
  const localPath = optimisticPath ?? message.localFilePath;
  const icon = message.type === "video" ? "🎥" : message.type === "file" ? "📎" : "📷";
  const label = mediaLabel(message.type);
  const filename = localPath ? localPath.split("/").pop() : null;
  const urlCount = attachmentUrlCount(message);
  const hasUrl = urlCount > 0;

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
      const data = (await res.json()) as { path?: string; count?: number; error?: string };
      if (!res.ok || !data.path) {
        setError(data.error || "다운로드 실패");
        return;
      }
      setOptimisticPath(data.path);
      onDownloaded?.(message.id, data.path);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyPath() {
    if (!localPath) return;
    const err = await copyText(localPath);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  }

  const btnBase = isFromMe
    ? "bg-[#1D3F7A] hover:bg-[#163266] text-blue-100"
    : "bg-[#E8E9EC] hover:bg-[#D6D8DF] text-[#1A1F36]";
  const statusClass = localPath
    ? isFromMe
      ? "bg-blue-100/20 text-blue-100"
      : "bg-green-50 text-green-700 border border-green-200"
    : hasUrl
      ? isFromMe
        ? "bg-white/10 text-blue-100"
        : "bg-amber-50 text-amber-700 border border-amber-200"
      : isFromMe
        ? "bg-white/10 text-blue-100"
        : "bg-gray-100 text-gray-500 border border-gray-200";

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2 flex-wrap">
        <span>{icon} {label}{urlCount > 1 ? ` ${urlCount}장` : ""}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusClass}`}>
          {localPath ? "다운로드됨" : hasUrl ? "미다운로드" : "원본없음"}
        </span>
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
            <button
              onClick={handleCopyPath}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${btnBase}`}
              title="다운로드 경로 복사"
            >
              {copiedPath ? "경로복사됨" : "경로복사"}
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

// 최근 N일 복사 버튼 기준일
const RECENT_COPY_DAYS = 2;

export function toPlainText(messages: Message[]): string {
  const sorted = [...messages].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  return sorted
    .filter((m) => m.text?.trim() || isMediaMessage(m))
    .map((m) => {
      const who = m.is_from_me
        ? "나"
        : m.sender_name || `상대(${m.sender_id.slice(-4)})`;
      let text = m.text;
      if (isMediaMessage(m)) {
        const name = m.localFilePath?.split("/").pop() || toPhotoFilename(m.timestamp);
        const state = m.localFilePath
          ? `다운로드됨: ${m.localFilePath}`
          : "미다운로드";
        const count = attachmentUrlCount(m);
        const label = count > 1 ? `${mediaLabel(m.type)} ${count}장` : mediaLabel(m.type);
        text = `[${label}: ${name}] [${state}]`;
      }
      const edited = m.is_edited ? " (수정됨)" : "";
      const reply = m.reply
        ? ` [답장: ${m.reply.senderName || `상대(${m.reply.senderId.slice(-4)})`}: ${replyPreview(m)}]`
        : "";
      if (m.type === "system") {
        return `[${formatTimestamp(m.timestamp)}] 시스템: ${text}`;
      }
      return `[${formatTimestamp(m.timestamp)}] ${who}${edited}:${reply} ${text}`;
    })
    .join("\n");
}

export function ChatView({
  chat,
  messages,
  loading,
  onRefresh,
  onRestore,
  onBack,
  onOpenAI,
  onAttachmentDownloaded,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rawMode, setRawMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copied2d, setCopied2d] = useState<"ok" | "none" | null>(null);
  const [copied2dCount, setCopied2dCount] = useState(0);
  const [manualInput, setManualInput] = useState("");
  const [manualSending, setManualSending] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkFailedIds, setBulkFailedIds] = useState<Set<string>>(() => new Set());

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
  const mediaMessages = sorted.filter(isMediaMessage);
  const downloadedMediaCount = mediaMessages.filter((m) => !!m.localFilePath).length;
  const downloadableMessages = mediaMessages
    .filter((m) => !m.localFilePath && hasDownloadUrl(m) && !bulkFailedIds.has(m.id))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const downloadBatch = downloadableMessages.slice(0, 20);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.id, messages.length]);

  // 채팅방 바뀌면 rawMode/입력 초기화
  useEffect(() => {
    setRawMode(false);
    setManualInput("");
    setManualError(null);
    setBulkProgress(null);
    setBulkError(null);
    setBulkFailedIds(new Set());
    setCopied2d(null);
  }, [chat?.id]);

  async function handleCopy() {
    const text = toPlainText(messages);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // 최근 2일치만 복사 (기준: 현재 시각 - 2일)
  async function handleCopyRecent() {
    const cutoff = Date.now() - RECENT_COPY_DAYS * 24 * 60 * 60 * 1000;
    const recent = messages.filter((m) => {
      const t = new Date(m.timestamp).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
    if (recent.length === 0) {
      setCopied2d("none");
      setTimeout(() => setCopied2d(null), 1800);
      return;
    }
    await navigator.clipboard.writeText(toPlainText(recent));
    setCopied2dCount(recent.length);
    setCopied2d("ok");
    setTimeout(() => setCopied2d(null), 1800);
  }

  async function handleDownloadAll() {
    if (bulkDownloading || downloadBatch.length === 0) return;
    setBulkDownloading(true);
    setBulkError(null);
    let success = 0;
    let failed = 0;
    const failedIds = new Set<string>();
    try {
      for (let i = 0; i < downloadBatch.length; i += 1) {
        const m = downloadBatch[i];
        setBulkProgress(`${i + 1}/${downloadBatch.length}`);
        const res = await fetch("/api/download-attachment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: m.chat_id,
            messageId: m.id,
          }),
        });
        const data = (await res.json()) as { path?: string; error?: string };
        if (!res.ok || !data.path) {
          failed += 1;
          failedIds.add(m.id);
          setBulkError(`${failed}개 건너뜀 · 최근 실패: ${mediaLabel(m.type)} ${m.id}: ${data.error || "다운로드 실패"}`);
          continue;
        }
        success += 1;
        onAttachmentDownloaded?.(m.id, data.path);
      }
      if (failedIds.size > 0) {
        setBulkFailedIds((prev) => {
          const next = new Set(prev);
          for (const id of failedIds) next.add(id);
          return next;
        });
      }
      const remaining = Math.max(downloadableMessages.length - success - failed, 0);
      setBulkProgress(
        success > 0 || failed > 0
          ? remaining > 0
            ? `${success}개 완료 · ${failed}개 건너뜀 · ${remaining}개 남음`
            : `${success}개 완료 · ${failed}개 건너뜀`
          : null,
      );
    } catch (e) {
      setBulkError(String(e));
    } finally {
      setBulkDownloading(false);
    }
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
              {mediaMessages.length > 0 && (
                <>
                  {" · 첨부 "}
                  {downloadedMediaCount}/{mediaMessages.length}
                </>
              )}
            </div>
            {(bulkProgress || bulkError) && (
              <div className={`text-[10px] mt-0.5 ${bulkError ? "text-red-500" : "text-[#2959AA]"}`}>
                {bulkError || `첨부 다운로드 ${bulkProgress}`}
              </div>
            )}
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
          {downloadableMessages.length > 0 && (
            <button
              onClick={handleDownloadAll}
              disabled={bulkDownloading}
              className="hidden md:inline-flex text-[11px] px-2 py-1 rounded transition-colors bg-[#2959AA] text-white hover:bg-[#1F4485] disabled:bg-[#9CA3AF]"
              title={
                downloadableMessages.length > 20
                  ? `미다운로드 첨부 ${downloadableMessages.length}개 중 20개만 순차 다운로드`
                  : "미다운로드 첨부 전체 순차 다운로드"
              }
            >
              {bulkDownloading
                ? `다운 ${bulkProgress || ""}`
                : downloadableMessages.length > 20
                  ? "전체다운로드 20개"
                  : "전체다운로드"}
            </button>
          )}
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
          {/* 최근 2일치 복사 */}
          <button
            onClick={handleCopyRecent}
            className={`text-xs md:text-[11px] px-2.5 py-1.5 md:px-2 md:py-1 rounded transition-colors ${
              copied2d === "ok"
                ? "bg-green-500 text-white"
                : copied2d === "none"
                  ? "bg-[#FDE8E8] text-[#B23434]"
                  : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
            }`}
            title={`최근 ${RECENT_COPY_DAYS}일치 메시지만 클립보드 복사`}
          >
            {copied2d === "ok"
              ? `${copied2dCount}건 복사됨`
              : copied2d === "none"
                ? "2일치 없음"
                : `${RECENT_COPY_DAYS}일복사`}
          </button>
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
                            {m.sender_name || m.sender_id.slice(-6)}
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
                          {m.reply && (
                            <div
                              className={`mb-1.5 border-l-2 pl-2 py-0.5 ${
                                m.is_from_me
                                  ? "border-blue-200 text-blue-100"
                                  : "border-[#9CA3AF] text-[#6B7280]"
                              }`}
                            >
                              <div className="text-[10px] font-medium">
                                {m.reply.senderName || m.reply.senderId.slice(-6)}
                              </div>
                              <div className="text-[11px] leading-4 line-clamp-2 whitespace-pre-wrap break-words">
                                {replyPreview(m)}
                              </div>
                            </div>
                          )}
                          <div className="whitespace-pre-wrap break-words">
                            {m.type === "photo" || m.type === "video" || m.type === "file" ? (
                              <MediaMessage
                                message={m}
                                isFromMe={m.is_from_me}
                                onDownloaded={onAttachmentDownloaded}
                              />
                            ) : (m.text || `[${m.type}]`)}
                          </div>
                          {/* 타임스탬프 */}
                          <div
                            className={`text-[9px] mt-0.5 ${
                              m.is_from_me ? "text-blue-200" : "text-[#9CA3AF]"
                            }`}
                          >
                            {formatTime(m.timestamp)}{m.is_edited ? " · 수정됨" : ""}
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
