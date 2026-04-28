"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Category, Chat, Message } from "@/lib/types";
import { ChatList } from "@/components/ChatList";
import { ChatView } from "@/components/ChatView";
import { AIPanel } from "@/components/AIPanel";
import { BoardView } from "@/components/BoardView";
import { SettingsModal } from "@/components/SettingsModal";
import { NewChatModal } from "@/components/NewChatModal";
import { RestoreModal } from "@/components/RestoreModal";

type View = "inbox" | "board";

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "client" | "casual">("all");
  const [chatsLoading, setChatsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<View>("inbox");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultView, setDefaultView] = useState<View>("inbox");
  const [defaultFilter, setDefaultFilter] = useState<"all" | "client" | "casual">("all");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [restoreChatId, setRestoreChatId] = useState<string | null>(null);

  useEffect(() => {
    const dv = localStorage.getItem("defaultView") as View | null;
    const df = localStorage.getItem("defaultFilter") as "all" | "client" | "casual" | null;
    if (dv) { setDefaultView(dv); setView(dv); }
    if (df) { setDefaultFilter(df); setFilter(df); }
  }, []);

  const chatsRef = useRef<Chat[]>([]);
  useEffect(() => { chatsRef.current = chats; }, [chats]);

  const loadChats = useCallback(() => {
    setChatsLoading(true);
    fetch("/api/chats")
      .then((r) => r.json())
      .then(setChats)
      .catch(console.error)
      .finally(() => setChatsLoading(false));
  }, []);

  useEffect(() => { loadChats(); }, [loadChats]);

  const loadMessages = useCallback((chatId: string) => {
    const chat = chatsRef.current.find((c) => c.id === chatId);
    const memberCount = chat?.member_count ?? 0;
    setMessagesLoading(true);
    // manual chat은 캐시에서만 읽음
    const url = chatId.startsWith("manual_")
      ? `/api/messages?chatId=${chatId}&memberCount=0&manualOnly=true`
      : `/api/messages?chatId=${chatId}&memberCount=${memberCount}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []))
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedChatId) return;
    loadMessages(selectedChatId);
  }, [selectedChatId, loadMessages]);

  const handleSelect = useCallback((id: string) => {
    setSelectedChatId(id);
    setMessages([]);
  }, []);

  const handleRefreshMessages = useCallback(() => {
    if (selectedChatId) loadMessages(selectedChatId);
  }, [selectedChatId, loadMessages]);

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
    setSelectedChatId(id);
    setMessages([]);
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
      setSelectedChatId(null);
      setMessages([]);
    }
  }

  function switchToInbox(chatId?: string) {
    setView("inbox");
    if (chatId) {
      setSelectedChatId(chatId);
      setMessages([]);
    }
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

  // ── 보드 뷰 ────────────────────────────────────────────────
  if (view === "board") {
    return (
      <>
        <BoardView
          chats={chats}
          filter={filter}
          onFilterChange={setFilter}
          onCategoryChange={handleCategoryChange}
          onSwitchToInbox={switchToInbox}
          onOpenSettings={() => setSettingsOpen(true)}
          refreshing={chatsLoading}
          onRefresh={loadChats}
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
  return (
    <>
      <div className="flex h-screen bg-[#D6D8DF] text-[#1A1F36] overflow-hidden">
        <div className={`${sidebarCollapsed ? "w-10" : "w-64"} shrink-0 h-full transition-all duration-200`}>
          <ChatList
            chats={chats}
            selectedChatId={selectedChatId}
            onSelect={handleSelect}
            filter={filter}
            onFilterChange={setFilter}
            onCategoryChange={handleCategoryChange}
            onRefresh={loadChats}
            refreshing={chatsLoading}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            onSwitchToBoard={() => setView("board")}
            onOpenSettings={() => setSettingsOpen(true)}
            onNewChat={() => setNewChatOpen(true)}
            onDeleteChat={handleDeleteChat}
          />
        </div>
        <div className="flex-1 h-full min-w-0">
          <ChatView
            chat={selectedChat}
            messages={messages}
            loading={messagesLoading}
            onRefresh={handleRefreshMessages}
            onRestore={selectedChat ? () => setRestoreChatId(selectedChat.id) : undefined}
          />
        </div>
        <div className="w-72 shrink-0 h-full">
          <AIPanel chat={selectedChat} />
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
