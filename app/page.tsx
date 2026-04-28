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
  const [mobileAIOpen, setMobileAIOpen] = useState(false);

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
    setMobileAIOpen(false);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedChatId(null);
    setMessages([]);
    setMobileAIOpen(false);
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
            sidebarCollapsed ? "md:w-10" : "md:w-64"
          } md:shrink-0 h-full transition-all duration-200`}
        >
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

        {/* ChatView */}
        <div
          className={`${showChatMobile ? "flex" : "hidden"} md:flex flex-1 h-full min-w-0`}
        >
          <ChatView
            chat={selectedChat}
            messages={messages}
            loading={messagesLoading}
            onRefresh={handleRefreshMessages}
            onRestore={selectedChat ? () => setRestoreChatId(selectedChat.id) : undefined}
            onBack={handleBack}
            onOpenAI={() => setMobileAIOpen(true)}
          />
        </div>

        {/* AIPanel: 데스크톱에선 우측 고정, 모바일에선 오버레이 */}
        <div
          className={`${
            mobileAIOpen ? "fixed inset-0 z-40 flex" : "hidden"
          } md:relative md:inset-auto md:z-auto md:flex md:w-72 md:shrink-0 h-full bg-white`}
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
