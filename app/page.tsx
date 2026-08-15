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
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [messageCursor, setMessageCursor] = useState<MessageCursor | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [messageTotal, setMessageTotal] = useState(0);
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
  const chatsRequestRef = useRef<Promise<void> | null>(null);
  const messagesRequestRef = useRef<Map<string, Promise<void>>>(new Map());
  const selectedChatIdRef = useRef<string | null>(null);
  const loadedOlderMessagesRef = useRef(false);
  const messageCacheRef = useRef<Map<string, CachedChatMessages>>(new Map());

  useEffect(() => {
    const dv = localStorage.getItem("defaultView") as View | null;
    const df = localStorage.getItem("defaultFilter") as "all" | "client" | "casual" | null;
    if (dv) { setDefaultView(dv); setView(dv); }
    if (df) { setDefaultFilter(df); setFilter(df); }
  }, []);

  // URL ?chat=xxx 처리 (ntfy 푸시 클릭 딥링크)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chatParam = params.get("chat");
    if (chatParam) {
      setSelectedChatId(chatParam);
      setView("inbox");
      // 쿼리스트링 제거 (뒤로가기 시 누적 방지)
      const url = new URL(window.location.href);
      url.searchParams.delete("chat");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const chatsRef = useRef<Chat[]>([]);
  useEffect(() => { chatsRef.current = chats; }, [chats]);

  const loadChats = useCallback((showLoading = true) => {
    if (chatsRequestRef.current) return chatsRequestRef.current;

    if (showLoading) setChatsLoading(true);
    const request = fetch("/api/chats")
      .then((r) => {
        if (!r.ok) throw new Error(`채팅 목록 요청 실패: ${r.status}`);
        return r.json();
      })
      .then((data) => setChats(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => {
        chatsRequestRef.current = null;
        if (showLoading) setChatsLoading(false);
      });

    chatsRequestRef.current = request;
    return request;
  }, []);

  useEffect(() => { void loadChats(); }, [loadChats]);

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
    const request = fetch(`/api/messages?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`메시지 요청 실패: ${r.status}`);
        return r.json();
      })
      .then((data: MessagePage) => {
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

          const resetPage = prepend || showLoading;
          setCachedChat(messageCacheRef.current, chatId, {
            messages: next,
            total: data.total ?? next.length,
            hasOlder: resetPage ? data.hasMore : cached?.hasOlder ?? data.hasMore,
            cursor: resetPage ? data.nextCursor : cached?.cursor ?? data.nextCursor,
            loadedOlder: prepend ? true : showLoading ? false : loadedOlder,
          });
          return next;
        };

        if (selectedChatIdRef.current === chatId) {
          setMessages((previous) => {
            const next = updateMessages(previous);
            if (prepend) loadedOlderMessagesRef.current = true;
            else if (showLoading) loadedOlderMessagesRef.current = false;
            return next;
          });
          setMessageTotal(data.total ?? incoming.length);
          if (prepend || showLoading) {
            setHasOlderMessages(data.hasMore);
            setMessageCursor(data.nextCursor);
          }
        } else {
          updateMessages(cached?.messages ?? []);
        }
      })
      .catch((error) => {
        console.error(error);
        if (!prepend && showLoading && selectedChatIdRef.current === chatId) {
          setMessages([]);
          setMessageTotal(0);
          setHasOlderMessages(false);
          setMessageCursor(null);
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
    void loadChats();
  }, [loadChats]);

  const handleSelect = useCallback((id: string) => {
    if (selectedChatIdRef.current === id) return;
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
    if (selectedChatId) void loadMessages(selectedChatId);
  }, [selectedChatId, loadMessages]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!selectedChatId || !messageCursor || olderMessagesLoading) return;
    await loadMessages(selectedChatId, {
      showLoading: false,
      before: messageCursor,
      prepend: true,
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

  async function handleDeleteChat(chatId: string) {
    await fetch("/api/manual-chat", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
    });
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (selectedChatId === chatId) {
      selectedChatIdRef.current = null;
      setSelectedChatId(null);
      setMessages([]);
      setMessageTotal(0);
      setHasOlderMessages(false);
      setMessageCursor(null);
      loadedOlderMessagesRef.current = false;
    }
    messageCacheRef.current.delete(chatId);
  }

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
      <div className="flex h-screen bg-[#D6D8DF] text-[#1A1F36] overflow-hidden">
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
            messages={messages}
            loading={messagesLoading}
            loadingOlder={olderMessagesLoading}
            hasOlderMessages={hasOlderMessages}
            messageTotal={messageTotal}
            onLoadOlder={handleLoadOlderMessages}
            onRefresh={handleRefreshMessages}
            onRestore={selectedChat ? () => setRestoreChatId(selectedChat.id) : undefined}
            onBack={handleBack}
            onOpenAI={() => setMobileAIOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onMessageSent={(message) => {
              setMessages((previous) => {
                const next = mergeMessages(previous, [message]);
                if (selectedChatId) {
                  const cached = messageCacheRef.current.get(selectedChatId);
                  if (cached) {
                    setCachedChat(messageCacheRef.current, selectedChatId, {
                      ...cached,
                      messages: next,
                      total: Math.max(cached.total, next.length),
                    });
                  }
                }
                return next;
              });
              setMessageTotal((total) => total + 1);
              setChats((previous) => previous.map((item) =>
                item.id === message.chat_id
                  ? { ...item, last_message_at: message.timestamp }
                  : item,
              ));
            }}
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
            onCloseMobile={() => setMobileAIOpen(false)}
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
