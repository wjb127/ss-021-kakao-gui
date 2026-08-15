"use client";

// 메시지 뷰 - 가운데 패널
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Chat, Message } from "@/lib/types";
import { parseKmong } from "@/lib/kmong-parser";

interface ChatSearchHit {
  id: string;
  chatId: string;
  text: string;
  snippet: string;
  isFromMe: boolean;
  senderName?: string;
  timestamp: string;
  type: string;
}

interface Props {
  chat: Chat | null;
  messages: Message[];
  loading: boolean;
  loadingOlder: boolean;
  hasOlderMessages: boolean;
  messageTotal: number;
  onLoadOlder: () => Promise<void>;
  onRefresh: () => void;
  onRestore?: () => void;
  onBack?: () => void;
  onOpenAI?: () => void;
  onOpenSettings?: () => void;
  onAttachmentDownloaded?: (messageId: string, filePath: string) => void;
  onMessageSent?: (message: Message) => void;
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

function highlightSearchText(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;
  const lowerText = text.toLocaleLowerCase();
  const lowerNeedle = needle.toLocaleLowerCase();
  const parts = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerNeedle);

  while (matchIndex >= 0) {
    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex));
    parts.push(
      <mark
        key={`${matchIndex}-${parts.length}`}
        className="bg-[#FFE36E] text-[#1A1F36] rounded-sm px-0.5"
      >
        {text.slice(matchIndex, matchIndex + needle.length)}
      </mark>,
    );
    cursor = matchIndex + needle.length;
    matchIndex = lowerText.indexOf(lowerNeedle, cursor);
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length > 0 ? parts : text;
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
  const [partialDownload, setPartialDownload] = useState(false);
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
      const data = (await res.json()) as {
        path?: string;
        count?: number;
        expectedCount?: number;
        partial?: boolean;
        errors?: string[];
        error?: string;
      };
      if (!res.ok || !data.path) {
        setError(data.error || "다운로드 실패");
        return;
      }
      setOptimisticPath(data.path);
      setPartialDownload(!!data.partial);
      if (data.partial) {
        setError(
          `${data.count ?? 0}/${data.expectedCount ?? urlCount}개 저장 · ${(data.errors ?? []).join(" · ")}`,
        );
      } else {
        onDownloaded?.(message.id, data.path);
      }
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
  const statusClass = partialDownload
    ? isFromMe
      ? "bg-amber-100/20 text-amber-100"
      : "bg-amber-50 text-amber-700 border border-amber-200"
    : localPath
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
          {partialDownload ? "일부 다운로드" : localPath ? "다운로드됨" : hasUrl ? "미다운로드" : "원본없음"}
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
            {partialDownload && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${btnBase} disabled:opacity-60`}
                title="실패한 첨부 다시 다운로드"
              >
                {downloading ? "재시도중…" : "재시도"}
              </button>
            )}
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
const MESSAGE_PAGE_SIZE_LABEL = 300;

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
      const deleted = m.is_deleted ? " (삭제됨, 원문 보존)" : "";
      const reply = m.reply
        ? ` [답장: ${m.reply.senderName || `상대(${m.reply.senderId.slice(-4)})`}: ${replyPreview(m)}]`
        : "";
      if (m.type === "system") {
        return `[${formatTimestamp(m.timestamp)}] 시스템: ${text}`;
      }
      return `[${formatTimestamp(m.timestamp)}] ${who}${edited}${deleted}:${reply} ${text}`;
    })
    .join("\n");
}

export function ChatView({
  chat,
  messages,
  loading,
  loadingOlder,
  hasOlderMessages,
  messageTotal,
  onLoadOlder,
  onRefresh,
  onRestore,
  onBack,
  onOpenAI,
  onOpenSettings,
  onAttachmentDownloaded,
  onMessageSent,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchComposingRef = useRef(false);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const replyComposingRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchResultRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const previousChatIdRef = useRef<string | null>(null);
  const previousLastMessageIdRef = useRef<string | null>(null);
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<ChatSearchHit[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [replyInput, setReplyInput] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySent, setReplySent] = useState(false);
  const [sendEnabled, setSendEnabled] = useState(false);

  const isManual = !!chat?.id?.startsWith("manual_");

  function openSearch() {
    setSearchOpen(true);
    setRawMode(false);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function closeSearch() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();
    setSearchOpen(false);
    setSearchQuery("");
    setSearchHits([]);
    setSearchIndex(0);
    setSearchLoading(false);
    setSearchError(null);
    setSearchTruncated(false);
    if (searchInputRef.current) searchInputRef.current.value = "";
  }

  function handleSearchQuery(value: string) {
    setSearchQuery(value);
    setSearchIndex(0);
    setSearchError(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();

    const query = value.trim();
    if (!query || !chat) {
      setSearchHits([]);
      setSearchLoading(false);
      setSearchTruncated(false);
      return;
    }

    setSearchLoading(true);
    searchTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      const params = new URLSearchParams({ q: query, chatId: chat.id });
      fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`검색 요청 실패: ${res.status}`);
          return res.json();
        })
        .then((data: {
          messages?: ChatSearchHit[];
          error?: string | null;
          truncated?: boolean;
        }) => {
          setSearchHits(Array.isArray(data.messages) ? data.messages : []);
          setSearchError(data.error ?? null);
          setSearchTruncated(!!data.truncated);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSearchHits([]);
          setSearchError(String(error));
        })
        .finally(() => {
          if (searchAbortRef.current === controller) setSearchLoading(false);
        });
    }, 180);
  }

  function moveSearch(direction: 1 | -1) {
    if (searchHits.length === 0) return;
    setSearchIndex((current) =>
      (current + direction + searchHits.length) % searchHits.length,
    );
  }

  async function handleReplySend() {
    const text = replyInputRef.current?.value.trim() ?? "";
    if (!chat || isManual || replySending || replyComposingRef.current || !text) return;
    const targetName = chat.member_count === 1
      ? "나와의 채팅"
      : chat.display_name || `(멤버 ${chat.member_count}명)`;
    if (!window.confirm(`${targetName}에 아래 메시지를 전송할까요?\n\n${text}`)) return;

    setReplySending(true);
    setReplyError(null);
    setReplySent(false);
    try {
      const response = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, text, confirmed: true }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: Message;
      };
      if (!response.ok || !data.message) {
        setReplyError(data.error || "메시지 발송 실패");
        return;
      }
      if (replyInputRef.current) replyInputRef.current.value = "";
      setReplyInput("");
      setReplySent(true);
      onMessageSent?.(data.message);
      setTimeout(() => setReplySent(false), 2000);
    } catch (error) {
      setReplyError(String(error));
    } finally {
      setReplySending(false);
    }
  }

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

  const lastMessageId = sorted[sorted.length - 1]?.id ?? null;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const chatChanged = previousChatIdRef.current !== (chat?.id ?? null);
    const latestChanged = previousLastMessageIdRef.current !== lastMessageId;
    if (el && (chatChanged || latestChanged)) el.scrollTop = el.scrollHeight;
    previousChatIdRef.current = chat?.id ?? null;
    previousLastMessageIdRef.current = lastMessageId;
  }, [chat?.id, lastMessageId]);

  async function handleLoadOlder() {
    const el = scrollRef.current;
    const previousHeight = el?.scrollHeight ?? 0;
    const previousTop = el?.scrollTop ?? 0;
    await onLoadOlder();
    requestAnimationFrame(() => {
      if (!el) return;
      el.scrollTop = previousTop + (el.scrollHeight - previousHeight);
    });
  }

  // 채팅방 바뀌면 rawMode/입력 초기화
  useEffect(() => {
    setRawMode(false);
    setManualInput("");
    setManualError(null);
    setBulkProgress(null);
    setBulkError(null);
    setBulkFailedIds(new Set());
    setCopied2d(null);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchHits([]);
    setSearchIndex(0);
    setSearchLoading(false);
    setSearchError(null);
    setSearchTruncated(false);
    if (searchInputRef.current) searchInputRef.current.value = "";
    if (replyInputRef.current) replyInputRef.current.value = "";
    searchComposingRef.current = false;
    replyComposingRef.current = false;
    setReplyInput("");
    setReplySending(false);
    setReplyError(null);
    setReplySent(false);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();
  }, [chat?.id]);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((settings) => setSendEnabled(settings.send_enabled === "1"))
      .catch(() => setSendEnabled(false));
  }, [chat?.id]);

  useEffect(() => {
    function handleFindShortcut(event: KeyboardEvent) {
      if (!chat || event.key.toLocaleLowerCase() !== "f") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      openSearch();
    }
    window.addEventListener("keydown", handleFindShortcut);
    return () => window.removeEventListener("keydown", handleFindShortcut);
  }, [chat]);

  useEffect(() => {
    const active = searchHits[searchIndex];
    if (!active) return;
    searchResultRefs.current.get(active.id)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [searchHits, searchIndex]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();
  }, []);

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
        const data = (await res.json()) as {
          path?: string;
          partial?: boolean;
          count?: number;
          expectedCount?: number;
          errors?: string[];
          error?: string;
        };
        if (!res.ok || !data.path) {
          failed += 1;
          failedIds.add(m.id);
          setBulkError(`${failed}개 건너뜀 · 최근 실패: ${mediaLabel(m.type)} ${m.id}: ${data.error || "다운로드 실패"}`);
          continue;
        }
        if (data.partial) {
          failed += 1;
          failedIds.add(m.id);
          setBulkError(
            `${failed}개 건너뜀 · 최근 일부 성공: ${mediaLabel(m.type)} ${m.id} ` +
            `${data.count ?? 0}/${data.expectedCount ?? attachmentUrlCount(m)}개 저장`,
          );
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
              멤버 {chat.member_count}명 · 메시지 {messageTotal || sorted.length}개
              {messageTotal > sorted.length && ` · 표시 ${sorted.length}개`}
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
          <button
            onClick={openSearch}
            className={`p-2 md:p-0 transition-colors ${
              searchOpen
                ? "text-[#2959AA]"
                : "text-[#6B7280] hover:text-[#1A1F36]"
            }`}
            title="현재 채팅 검색"
            aria-label="현재 채팅 검색"
          >
            <svg className="w-5 h-5 md:w-3.5 md:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="m20 20-3.5-3.5" />
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

      {searchOpen && (
        <div className="shrink-0 border-b border-[#D6D8DF] bg-white px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                defaultValue=""
                onChange={(event) => {
                  if (!searchComposingRef.current) {
                    handleSearchQuery(event.target.value);
                  }
                }}
                onCompositionStart={() => { searchComposingRef.current = true; }}
                onCompositionEnd={(event) => {
                  searchComposingRef.current = false;
                  handleSearchQuery(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeSearch();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    moveSearch(event.shiftKey ? -1 : 1);
                  }
                }}
                placeholder="현재 채팅 내용 검색"
                className="w-full h-8 pl-8 pr-3 text-xs text-[#1A1F36] bg-[#F5F6F8] border border-[#D6D8DF] rounded focus:outline-none focus:border-[#2959AA]"
              />
            </div>
            <span className="min-w-[48px] text-center text-[10px] text-[#6B7280] tabular-nums">
              {searchLoading
                ? "검색 중"
                : searchHits.length > 0
                  ? `${searchIndex + 1}/${searchHits.length}${searchTruncated ? "+" : ""}`
                  : "0/0"}
            </span>
            <button
              onClick={() => moveSearch(-1)}
              disabled={searchHits.length === 0}
              className="w-7 h-7 grid place-items-center rounded text-[#6B7280] hover:bg-[#E8E9EC] disabled:text-[#C7CAD3]"
              title="이전 결과"
              aria-label="이전 검색 결과"
            >
              ↑
            </button>
            <button
              onClick={() => moveSearch(1)}
              disabled={searchHits.length === 0}
              className="w-7 h-7 grid place-items-center rounded text-[#6B7280] hover:bg-[#E8E9EC] disabled:text-[#C7CAD3]"
              title="다음 결과"
              aria-label="다음 검색 결과"
            >
              ↓
            </button>
            <button
              onClick={closeSearch}
              className="w-7 h-7 grid place-items-center rounded text-[#6B7280] hover:bg-[#E8E9EC]"
              title="검색 닫기"
              aria-label="검색 닫기"
            >
              ×
            </button>
          </div>
          {searchError && (
            <div className="mt-1 text-[10px] text-[#B23434]">{searchError}</div>
          )}
        </div>
      )}

      {/* 메시지 스크롤 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!loading && hasOlderMessages && (
          <div className="flex justify-center px-4 pt-3">
            <button
              onClick={handleLoadOlder}
              disabled={loadingOlder}
              className="text-[11px] px-3 py-1.5 rounded bg-white border border-[#D6D8DF] text-[#2959AA] hover:bg-[#F5F6F8] disabled:text-[#9CA3AF] transition-colors"
            >
              {loadingOlder ? "이전 메시지 불러오는 중…" : `이전 메시지 ${MESSAGE_PAGE_SIZE_LABEL}개 불러오기`}
            </button>
          </div>
        )}
        {searchOpen && searchQuery.trim() ? (
          searchLoading && searchHits.length === 0 ? (
            <div className="text-center text-[#6B7280] text-xs py-8">검색 중...</div>
          ) : searchHits.length === 0 ? (
            <div className="text-center text-[#6B7280] text-xs py-8">검색 결과가 없습니다</div>
          ) : (
            <div className="px-3 py-3 space-y-1.5">
              {searchHits.map((hit, index) => (
                <button
                  key={hit.id}
                  ref={(element) => {
                    if (element) searchResultRefs.current.set(hit.id, element);
                    else searchResultRefs.current.delete(hit.id);
                  }}
                  onClick={() => setSearchIndex(index)}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                    index === searchIndex
                      ? "bg-[#EEF4FF] border-[#2959AA]"
                      : "bg-white border-[#D6D8DF] hover:border-[#9CA3AF]"
                  }`}
                >
                  <div className="flex items-center gap-2 text-[10px] text-[#6B7280]">
                    <span className={hit.isFromMe ? "text-[#2959AA]" : "text-[#B23434]"}>
                      {hit.isFromMe ? "나" : hit.senderName || "상대"}
                    </span>
                    <span>{new Date(hit.timestamp).toLocaleString("ko-KR")}</span>
                    {index === searchIndex && (
                      <span className="ml-auto text-[#2959AA]">선택됨</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[#1A1F36] whitespace-pre-wrap break-words select-text cursor-text">
                    {highlightSearchText(hit.text || `[${hit.type}]`, searchQuery)}
                  </div>
                </button>
              ))}
            </div>
          )
        ) : loading ? (
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
          <pre className="p-4 text-xs text-[#1A1F36] font-mono whitespace-pre-wrap break-words leading-5 select-text cursor-text">
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
                          {m.is_deleted && (
                            <div
                              className={`mb-1 text-[10px] font-medium ${
                                m.is_from_me ? "text-red-200" : "text-[#B23434]"
                              }`}
                            >
                              삭제됨 · 원문 보존
                            </div>
                          )}
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
                          <div className="whitespace-pre-wrap break-words select-text cursor-text">
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
                            {formatTime(m.timestamp)}
                            {m.is_edited ? " · 수정됨" : ""}
                            {m.is_deleted ? " · 삭제됨" : ""}
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

      {!isManual && (
        <div className="shrink-0 border-t border-[#D6D8DF] bg-white px-3 py-2">
          {replyError && (
            <div className="mb-1.5 text-[10px] text-[#B23434]">{replyError}</div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={replyInputRef}
              defaultValue=""
              onChange={(event) => {
                if (replyComposingRef.current) return;
                setReplyInput(event.target.value);
                setReplyError(null);
                setReplySent(false);
              }}
              onCompositionStart={() => { replyComposingRef.current = true; }}
              onCompositionEnd={(event) => {
                replyComposingRef.current = false;
                setReplyInput(event.currentTarget.value);
                setReplyError(null);
                setReplySent(false);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                  && (event.metaKey || event.ctrlKey)
                  && !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void handleReplySend();
                }
              }}
              rows={2}
              placeholder={chat.member_count === 1 ? "나와의 채팅에 메시지 입력" : "카카오톡 답변 입력"}
              className="flex-1 min-w-0 max-h-32 resize-none rounded border border-[#D6D8DF] bg-[#F5F6F8] px-3 py-2 text-sm leading-5 text-[#1A1F36] placeholder:text-[#9CA3AF] focus:bg-white focus:outline-none focus:border-[#2959AA]"
              disabled={replySending}
            />
            {sendEnabled ? (
              <button
                onClick={() => void handleReplySend()}
                disabled={replySending || !replyInput.trim()}
                className={`h-10 shrink-0 px-4 rounded text-xs font-medium text-white transition-colors disabled:bg-[#9CA3AF] ${
                  replySent
                    ? "bg-green-600"
                    : "bg-[#2959AA] hover:bg-[#1F4485]"
                }`}
              >
                {replySending ? "전송 중" : replySent ? "전송됨" : "전송"}
              </button>
            ) : (
              <button
                onClick={onOpenSettings}
                className="h-10 shrink-0 px-3 rounded text-xs font-medium bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
                title="설정에서 카톡 자동발송 활성화"
              >
                발송 설정
              </button>
            )}
          </div>
        </div>
      )}

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
