"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Category,
  Chat,
  Message,
  MessageCursor,
  MessagePage,
} from "@/lib/types";
import { ChatList } from "@/components/ChatList";
import { ChatView } from "@/components/ChatView";
import { AIPanel } from "@/components/AIPanel";
import { BoardView } from "@/components/BoardView";
import { CardView } from "@/components/CardView";
import { SettingsModal } from "@/components/SettingsModal";
import { NewChatModal } from "@/components/NewChatModal";
import { RestoreModal } from "@/components/RestoreModal";
import { useIsAdmin } from "@/components/TeamShell";
import { fetchRefreshJson } from "@/lib/refresh-fetch";
import { reconcileChats } from "@/lib/chat-list-state";

function RefreshNotice({ text }: { text: string }) {
  return text ? <div role="status" className="pointer-events-none fixed bottom-3 left-3 right-3 z-50 mx-auto w-fit max-w-[calc(100%-24px)] rounded-md border border-[#D6D8DF] bg-white px-3 py-2 text-xs text-[#2959AA] shadow-sm">{text}</div> : null;
}

type View = "inbox" | "board" | "card";
const AUTO_REFRESH_INTERVAL_MS = 60_000;
const MESSAGE_PAGE_SIZE = 300;
const MESSAGE_CACHE_LIMIT = 8;

interface CachedChatMessages {
  messages: Message[];
  total: number;
  hasOlder: boolean;
  cursor: MessageCursor | null;
  loadedOlder: boolean;
}

function mergeMessages(...groups: Message[][]): Message[] {
  const byId = new Map<string, Message>();
  for (const group of groups) {
    for (const message of group) byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
  );
}

function setCachedChat(
  cache: Map<string, CachedChatMessages>,
  chatId: string,
  value: CachedChatMessages,
): void {
  cache.delete(chatId);
  cache.set(chatId, value);
  while (cache.size > MESSAGE_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export default function Home() {
  const isAdmin = useIsAdmin();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [messageCursor, setMessageCursor] = useState<MessageCursor | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [messageTotal, setMessageTotal] = useState(0);
  const [historyPending, setHistoryPending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [chatsPending, setChatsPending] = useState(false);
  const [chatsNotice, setChatsNotice] = useState("");
  const [messagesNotice, setMessagesNotice] = useState("");
  const [filter, setFilter] = useState<"all" | "client" | "casual">("client");
  const [chatsLoading, setChatsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<View>("inbox");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultView, setDefaultView] = useState<View>("inbox");
  const [defaultFilter, setDefaultFilter] = useState<"all" | "client" | "casual">("client");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [restoreChatId, setRestoreChatId] = useState<string | null>(null);
  const [mobileAIOpen, setMobileAIOpen] = useState(false);
  const [panelTabRequest, setPanelTabRequest] = useState<{ tab: "업무" | "답변"; sequence: number }>({ tab: "업무", sequence: 0 });
  const openPanel = (tab: "업무" | "답변") => {
    setPanelTabRequest((previous) => ({ tab, sequence: previous.sequence + 1 }));
    setMobileAIOpen(true);
  };
  const [messageTarget, setMessageTarget] = useState<{ chatId: string; id: string; nonce: number } | null>(null);
  const chatsRequestRef = useRef<Promise<void> | null>(null);
  const messagesRequestRef = useRef<Map<string, Promise<void>>>(new Map());
  const selectedChatIdRef = useRef<string | null>(null);
  const loadedOlderMessagesRef = useRef(false);
  const messageCacheRef = useRef<Map<string, CachedChatMessages>>(new Map());

  useEffect(() => {
    const dv = localStorage.getItem("defaultView") as View | null;
    const df = localStorage.getItem("defaultFilter") as "all" | "client" | "casual" | null;
    if (dv) { setDefaultView(dv); setView(dv); }
    if (df && isAdmin) { setDefaultFilter(df); setFilter(df); }
    if (!isAdmin) { setDefaultFilter("all"); setFilter("all"); }
  }, [isAdmin]);

  // URL ?chat=xxx 처리 (ntfy 푸시 클릭 딥링크)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chatParam = params.get("chat");
    if (chatParam) {
      setSelectedChatId(chatParam);
      setView("inbox");
      if (params.get("work") === "1") setMobileAIOpen(true);
      // 쿼리스트링 제거 (뒤로가기 시 누적 방지)
      const url = new URL(window.location.href);
      url.searchParams.delete("chat");
      url.searchParams.delete("work");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const chatsRef = useRef<Chat[]>([]);
  useEffect(() => { chatsRef.current = chats; }, [chats]);

  const loadChats = useCallback((showLoading = true, poll = false, force = false) => {
    if (chatsRequestRef.current) return chatsRequestRef.current;

    if (showLoading) setChatsLoading(true);
    if (showLoading) setChatsNotice("채팅 목록 새로고침 중…");
    const signal = AbortSignal.timeout(4500);
    const request = fetchRefreshJson<Chat[]>(poll ? "/api/chats?poll=1" : force ? "/api/chats?fresh=1" : "/api/chats", signal)
      .then(({ data, headers }) => {
        if (!Array.isArray(data)) throw new Error("잘못된 목록 응답");
        setChats((previous) => reconcileChats(previous, data));
        setChatsLoading(false);
        const pending = headers.get("X-Refresh-Pending") === "1";
        setChatsPending(pending);
        setChatsNotice(pending ? "저장된 목록 표시 중 · 최신 목록을 가져오고 있어요." : headers.get("X-Refresh-Failed") === "1" ? "목록 갱신 실패 · 기존 목록을 유지했어요. 다시 시도해 주세요." : "");
      })
      .catch(() => { setChatsPending(false); setChatsNotice("목록 연결이 지연돼요. 기존 목록을 유지했어요. 다시 시도해 주세요."); })
      .finally(() => {
        chatsRequestRef.current = null;
        if (showLoading) setChatsLoading(false);
      });

    chatsRequestRef.current = request;
    return request;
  }, []);

  useEffect(() => { void loadChats(); }, [loadChats]);

  useEffect(() => {
    if (!chatsPending) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void loadChats(false, true); }, 2000);
    return () => clearInterval(timer);
  }, [chatsPending, loadChats]);

  // 목록 상한 밖의 오래된 대화도 할 일에서 바로 열 수 있게 조회한다.
  useEffect(() => {
    if (!selectedChatId || chatsLoading || chats.some((chat) => chat.id === selectedChatId)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lookup = async (poll = false) => {
      try {
        const { data: found, headers } = await fetchRefreshJson<Chat[]>(`/api/chats?chatId=${encodeURIComponent(selectedChatId)}${poll ? "&poll=1" : ""}`,
          AbortSignal.any([controller.signal, AbortSignal.timeout(4500)]));
        if (controller.signal.aborted) return;
        if (found.length) setChats((previous) => [...previous.filter((chat) => chat.id !== selectedChatId), ...found]);
        else if (headers.get("X-Refresh-Pending") === "1") timer = setTimeout(() => void lookup(true), 2000);
      } catch { /* 조회 실패는 다음 목록 갱신에서 다시 시도한다. */ }
    };
    void lookup();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [selectedChatId, chatsLoading, chats]);

  const loadMessages = useCallback((
    chatId: string,
    options?: {
      showLoading?: boolean;
      before?: MessageCursor | null;
      prepend?: boolean;
      sync?: boolean;
    },
  ) => {
    const showLoading = options?.showLoading ?? true;
    const before = options?.before ?? null;
    const prepend = options?.prepend ?? false;
    const sync = options?.sync ?? true;
    const requestKey = `${chatId}:${before?.timestamp ?? "latest"}:${before?.id ?? ""}:${sync ? "sync" : "cache"}`;
    const activeRequest = messagesRequestRef.current.get(requestKey);
    if (activeRequest) return activeRequest;

    const chat = chatsRef.current.find((c) => c.id === chatId);
    const memberCount = chat?.member_count ?? 0;
    if (prepend) setOlderMessagesLoading(true);
    else if (showLoading) setMessagesLoading(true);
    const params = new URLSearchParams({
      chatId,
      memberCount: chatId.startsWith("manual_") ? "0" : String(memberCount),
      paginated: "1",
      limit: String(MESSAGE_PAGE_SIZE),
      sync: sync ? "1" : "0",
    });
    if (before) {
      params.set("beforeTimestamp", before.timestamp);
      params.set("beforeId", before.id);
    }
    const request = fetchRefreshJson<MessagePage>(`/api/messages?${params.toString()}`)
      .then(({ data }) => {
        const incoming = Array.isArray(data.messages) ? data.messages : [];
        const deletedIds = new Set(data.deletedMessageIds ?? []);
        const cached = messageCacheRef.current.get(chatId);
        const updateMessages = (previous: Message[]) => {
          const loadedOlder = selectedChatIdRef.current === chatId
            ? loadedOlderMessagesRef.current
            : cached?.loadedOlder ?? false;
          let next: Message[];
          if (prepend) {
            next = mergeMessages(incoming, previous);
          } else if (showLoading || previous.length === 0 || !loadedOlder) {
            next = incoming;
          } else {
            next = mergeMessages(
              previous.map((message) =>
                deletedIds.has(message.id)
                  ? { ...message, is_deleted: true }
                  : message,
              ),
              incoming,
            );
          }

          const resetPage = prepend || showLoading || !loadedOlder;
          const historyGrew = !resetPage && data.total > (cached?.total ?? 0)
            && data.total > next.length;
          const first = next[0];
          setCachedChat(messageCacheRef.current, chatId, {
            messages: next,
            total: data.total ?? next.length,
            hasOlder: historyGrew || (resetPage ? data.hasMore : cached?.hasOlder ?? data.hasMore),
            cursor: historyGrew && first
              ? { timestamp: first.timestamp, id: first.id }
              : resetPage ? data.nextCursor : cached?.cursor ?? data.nextCursor,
            loadedOlder: prepend ? true : showLoading ? false : loadedOlder,
          });
          return next;
        };

        if (selectedChatIdRef.current === chatId) {
          if (!prepend) {
            setSyncPending(!!data.syncPending);
            setMessagesNotice(data.syncPending ? "저장된 대화 표시 중 · 최신 대화를 가져오고 있어요." : data.syncFailed ? "대화 갱신 실패 · 기존 대화를 유지했어요. 다시 시도해 주세요." : "");
          }
          setHistoryPending(!!data.historyPending);
          setMessages((previous) => {
            const next = updateMessages(previous);
            if (prepend) loadedOlderMessagesRef.current = true;
            else if (showLoading) loadedOlderMessagesRef.current = false;
            return next;
          });
          setMessageTotal(data.total ?? incoming.length);
          if (prepend || showLoading || !loadedOlderMessagesRef.current) {
            setHasOlderMessages(data.hasMore);
            setMessageCursor(data.nextCursor);
          } else if (cached && data.total > cached.total && data.total > cached.messages.length) {
            const first = cached.messages[0];
            if (first) {
              setHasOlderMessages(true);
              setMessageCursor({ timestamp: first.timestamp, id: first.id });
            }
          }
        } else {
          updateMessages(cached?.messages ?? []);
        }
      })
      .catch((error) => {
        console.error(error);
        if (selectedChatIdRef.current === chatId) {
          setSyncPending(false);
          setMessagesNotice("대화 연결이 지연돼요. 기존 대화를 유지했어요. 다시 시도해 주세요.");
        }
      })
      .finally(() => {
        messagesRequestRef.current.delete(requestKey);
        if (prepend) setOlderMessagesLoading(false);
        else if (showLoading && selectedChatIdRef.current === chatId) {
          setMessagesLoading(false);
        }
      });

    messagesRequestRef.current.set(requestKey, request);
    return request;
  }, []);

  const restoreCachedChat = useCallback((chatId: string): boolean => {
    const cached = messageCacheRef.current.get(chatId);
    if (!cached) return false;
    setCachedChat(messageCacheRef.current, chatId, cached);
    setMessages(cached.messages);
    setMessageTotal(cached.total);
    setHasOlderMessages(cached.hasOlder);
    setMessageCursor(cached.cursor);
    loadedOlderMessagesRef.current = cached.loadedOlder;
    setMessagesLoading(false);
    return true;
  }, []);

  useEffect(() => {
    if ((!historyPending && !syncPending) || !selectedChatId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadMessages(selectedChatId, { showLoading: false, sync: false });
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [historyPending, syncPending, selectedChatId, loadMessages]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
    if (!selectedChatId || chats.length === 0) return;
    const restored = restoreCachedChat(selectedChatId);
    if (selectedChatId.startsWith("manual_")) {
      if (!restored) void loadMessages(selectedChatId, { sync: false });
      return;
    }
    if (restored) {
      void loadMessages(selectedChatId, { showLoading: false, sync: true });
      return;
    }
    void loadMessages(selectedChatId, { sync: false }).then(() => {
      if (selectedChatIdRef.current !== selectedChatId) return;
      const hasLocalMessages = (messageCacheRef.current.get(selectedChatId)?.messages.length ?? 0) > 0;
      return loadMessages(selectedChatId, {
        showLoading: !hasLocalMessages,
        sync: true,
      });
    });
  }, [selectedChatId, chats.length, loadMessages, restoreCachedChat]);

  useEffect(() => {
    const refreshVisibleData = () => {
      if (document.visibilityState !== "visible") return;

      void loadChats(false);
      const chatId = selectedChatIdRef.current;
      if (chatId) void loadMessages(chatId, { showLoading: false });
    };

    const intervalId = window.setInterval(
      refreshVisibleData,
      AUTO_REFRESH_INTERVAL_MS,
    );
    window.addEventListener("focus", refreshVisibleData);
    document.addEventListener("visibilitychange", refreshVisibleData);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleData);
      document.removeEventListener("visibilitychange", refreshVisibleData);
    };
  }, [loadChats, loadMessages]);

  const handleRefreshChats = useCallback(() => {
    void loadChats(true, false, true);
  }, [loadChats]);

  const handleSelect = useCallback((id: string) => {
    if (selectedChatIdRef.current === id) return;
    setHistoryPending(false);
    setSyncPending(false);
    setMessagesNotice("");
    selectedChatIdRef.current = id;
    if (!restoreCachedChat(id)) {
      setMessages([]);
      setMessageTotal(0);
      setHasOlderMessages(false);
      setMessageCursor(null);
      loadedOlderMessagesRef.current = false;
    }
    setSelectedChatId(id);
    setMobileAIOpen(false);
  }, [restoreCachedChat]);

  const handleBack = useCallback(() => {
    setSyncPending(false);
    setHistoryPending(false);
    setMessagesNotice("");
    selectedChatIdRef.current = null;
    setSelectedChatId(null);
    setMessages([]);
    setMessageTotal(0);
    setHasOlderMessages(false);
    setMessageCursor(null);
    loadedOlderMessagesRef.current = false;
    setMobileAIOpen(false);
  }, []);

  const handleRefreshMessages = useCallback(() => {
    if (selectedChatId) {
      setMessagesNotice("대화 새로고침 중…");
      void loadMessages(selectedChatId, { showLoading: false });
    }
  }, [selectedChatId, loadMessages]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!selectedChatId || !messageCursor || olderMessagesLoading) return;
    await loadMessages(selectedChatId, {
      showLoading: false,
      before: messageCursor,
      prepend: true,
      sync: false,
    });
  }, [selectedChatId, messageCursor, olderMessagesLoading, loadMessages]);

  const handleCategoryChange = useCallback(
    async (chatId: string, category: Category | null) => {
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, category } : c)),
      );
      try {
        await fetch("/api/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, category }),
        });
      } catch (e) {
        console.error("카테고리 저장 실패", e);
      }
    },
    [],
  );

  function handleNewChatCreated(id: string, name: string) {
    setChats((prev) => [
      {
        id,
        display_name: name,
        member_count: 2,
        unread_count: 0,
        last_message_at: new Date().toISOString(),
        category: null,
      },
      ...prev,
    ]);
    selectedChatIdRef.current = id;
    setSelectedChatId(id);
    setMessages([]);
    setMessageTotal(0);
    setHasOlderMessages(false);
    setMessageCursor(null);
    loadedOlderMessagesRef.current = false;
    setView("inbox");
  }

  const handleDeleteChat = useCallback(async (chatId: string) => {
    await fetch("/api/manual-chat", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
    });
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (selectedChatIdRef.current === chatId) {
      selectedChatIdRef.current = null;
      setSelectedChatId(null);
      setMessages([]);
      setMessageTotal(0);
      setHasOlderMessages(false);
      setMessageCursor(null);
      loadedOlderMessagesRef.current = false;
    }
    messageCacheRef.current.delete(chatId);
  }, []);

  function switchToInbox(chatId?: string) {
    setView("inbox");
    if (chatId) handleSelect(chatId);
  }

  function handleDefaultViewChange(v: View) {
    setDefaultView(v);
    localStorage.setItem("defaultView", v);
  }

  function handleDefaultFilterChange(f: "all" | "client" | "casual") {
    setDefaultFilter(f);
    setFilter(f);
    localStorage.setItem("defaultFilter", f);
  }

  const selectedChat = chats.find((c) => c.id === selectedChatId) ?? null;
  const restoreChat = chats.find((c) => c.id === restoreChatId) ?? null;

  // ── 보드 뷰 (가로 스크롤) ──────────────────────────────────
  if (view === "board") {
    return (
      <>
        <div style={{ height: chatsNotice ? "calc(100% - 56px)" : "100%" }}>
        <BoardView
          chats={chats}
          filter={filter}
          onFilterChange={setFilter}
          onCategoryChange={handleCategoryChange}
          onSwitchToInbox={switchToInbox}
          onSwitchToCard={() => setView("card")}
          onOpenSettings={() => setSettingsOpen(true)}
          onNewChat={() => {
            setView("inbox");
            setNewChatOpen(true);
          }}
          refreshing={chatsLoading}
          onRefresh={handleRefreshChats}
        />
        </div>
        <RefreshNotice text={chatsNotice} />
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          defaultView={defaultView}
          onDefaultViewChange={handleDefaultViewChange}
          defaultFilter={defaultFilter}
          onDefaultFilterChange={handleDefaultFilterChange}
        />
      </>
    );
  }

  // ── 카드 뷰 (세로 그리드) ──────────────────────────────────
  if (view === "card") {
    return (
      <>
        <div style={{ height: chatsNotice ? "calc(100% - 56px)" : "100%" }}>
        <CardView
          chats={chats}
          onSwitchToInbox={switchToInbox}
          onSwitchToBoard={() => setView("board")}
          onOpenSettings={() => setSettingsOpen(true)}
          onNewChat={() => {
            setView("inbox");
            setNewChatOpen(true);
          }}
          refreshing={chatsLoading}
          onRefresh={handleRefreshChats}
        />
        </div>
        <RefreshNotice text={chatsNotice} />
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          defaultView={defaultView}
          onDefaultViewChange={handleDefaultViewChange}
          defaultFilter={defaultFilter}
          onDefaultFilterChange={handleDefaultFilterChange}
        />
      </>
    );
  }

  // ── 인박스 뷰 ──────────────────────────────────────────────
  // 모바일: list/chat 한 번에 하나만, AI는 풀스크린 오버레이
  // 데스크톱(md+): 3패널 가로 배치
  const showListMobile = !selectedChatId;
  const showChatMobile = !!selectedChatId;

  return (
    <>
      <div className="flex h-screen bg-[#D6D8DF] text-[#1A1F36] overflow-hidden" style={{ height: messagesNotice || chatsNotice ? "calc(100% - 56px)" : "100%" }}>
        <RefreshNotice text={messagesNotice || chatsNotice} />
        {/* ChatList */}
        <div
          className={`${showListMobile ? "flex" : "hidden"} md:flex w-full ${
            sidebarCollapsed ? "md:w-10 md:basis-10" : "md:w-64 md:basis-64"
          } md:shrink-0 md:grow-0 h-full overflow-hidden transition-all duration-200`}
        >
          <ChatList
            chats={chats}
            selectedChatId={selectedChatId}
            onSelect={handleSelect}
            filter={filter}
            onFilterChange={setFilter}
            onCategoryChange={handleCategoryChange}
            onRefresh={handleRefreshChats}
            refreshing={chatsLoading}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            onSwitchToBoard={() => setView("board")}
            onSwitchToCard={() => setView("card")}
            onOpenSettings={() => setSettingsOpen(true)}
            onNewChat={() => setNewChatOpen(true)}
            onDeleteChat={handleDeleteChat}
          />
        </div>

        {/* ChatView */}
        <div
          className={`${showChatMobile ? "flex" : "hidden"} md:flex flex-1 h-full min-w-0`}
        >
          <ChatView
            chat={selectedChat}
            messageTarget={messageTarget}
            onOpenWork={() => openPanel("업무")}
            onOpenReply={() => openPanel("답변")}
            messages={messages}
            loading={messagesLoading}
            loadingOlder={olderMessagesLoading}
            hasOlderMessages={hasOlderMessages}
            messageTotal={messageTotal}
            onLoadOlder={handleLoadOlderMessages}
            onRefresh={handleRefreshMessages}
            onRestore={selectedChat ? () => setRestoreChatId(selectedChat.id) : undefined}
            onBack={handleBack}
            onAttachmentDownloaded={(messageId, filePath) => {
              setMessages((prev) => {
                const next = prev.map((m) =>
                  m.id === messageId ? { ...m, localFilePath: filePath } : m,
                );
                if (selectedChatId) {
                  const cached = messageCacheRef.current.get(selectedChatId);
                  if (cached) {
                    setCachedChat(messageCacheRef.current, selectedChatId, {
                      ...cached,
                      messages: next,
                    });
                  }
                }
                return next;
              });
            }}
          />
        </div>

        {/* AIPanel: 데스크톱에선 우측 고정, 모바일에선 오버레이 */}
        <div
          className={`${
            mobileAIOpen ? "fixed inset-0 z-40 flex" : "hidden"
          } md:relative md:inset-auto md:z-auto md:flex md:w-72 md:basis-72 md:shrink-0 md:grow-0 h-full bg-white overflow-hidden`}
        >
          <AIPanel
            chat={selectedChat}
            tabRequest={panelTabRequest}
            settingsOpen={settingsOpen}
            onOpenSettings={() => { setMobileAIOpen(false); setSettingsOpen(true); }}
            onMessageSent={(message) => {
              const cached = messageCacheRef.current.get(message.chat_id);
              if (cached) {
                const next = mergeMessages(cached.messages, [message]);
                setCachedChat(messageCacheRef.current, message.chat_id, {
                  ...cached, messages: next, total: Math.max(cached.total + 1, next.length),
                });
              }
              if (selectedChatIdRef.current === message.chat_id) {
                setMessages((previous) => mergeMessages(previous, [message]));
                setMessageTotal((total) => total + 1);
              }
              setChats((previous) => previous.map((item) => item.id === message.chat_id
                ? { ...item, last_message_at: message.timestamp } : item));
            }}
            onCloseMobile={() => setMobileAIOpen(false)}
            onBoardChange={(board) => setChats((previous) => previous.map((item) => item.id === selectedChatId ? { ...item, board } : item))}
            onOpenMessage={(id) => {
              if (!selectedChatId) return;
              setMessageTarget({ chatId: selectedChatId, id, nonce: Date.now() });
              setMobileAIOpen(false);
            }}
          />
        </div>
      </div>

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onCreate={handleNewChatCreated}
      />

      {restoreChat && (
        <RestoreModal
          open={!!restoreChatId}
          chatId={restoreChat.id}
          chatName={restoreChat.display_name || restoreChat.id}
          onClose={() => setRestoreChatId(null)}
          onSuccess={() => {
            if (restoreChatId) loadMessages(restoreChatId);
          }}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        defaultView={defaultView}
        onDefaultViewChange={handleDefaultViewChange}
        defaultFilter={defaultFilter}
        onDefaultFilterChange={handleDefaultFilterChange}
      />
    </>
  );
}
