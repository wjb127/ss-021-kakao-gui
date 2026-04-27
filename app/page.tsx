"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Category, Chat, Message } from "@/lib/types";
import { ChatList } from "@/components/ChatList";
import { ChatView } from "@/components/ChatView";
import { AIPanel } from "@/components/AIPanel";

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "client" | "casual">("all");
  const [chatsLoading, setChatsLoading] = useState(false);

  // chats를 ref로도 유지 — loadMessages에서 최신값 참조용
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
    fetch(`/api/messages?chatId=${chatId}&memberCount=${memberCount}`)
      .then((r) => r.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []))
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }, []);

  // 채팅방 선택 시 메시지 로드
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

  const selectedChat = chats.find((c) => c.id === selectedChatId) ?? null;

  return (
    /* 페이지 루트: 60% 배경색 */
    <div className="flex h-screen bg-[#D6D8DF] text-[#1A1F36] overflow-hidden">
      <div className="w-64 shrink-0 h-full">
        <ChatList
          chats={chats}
          selectedChatId={selectedChatId}
          onSelect={handleSelect}
          filter={filter}
          onFilterChange={setFilter}
          onCategoryChange={handleCategoryChange}
          onRefresh={loadChats}
          refreshing={chatsLoading}
        />
      </div>
      <div className="flex-1 h-full min-w-0">
        <ChatView
          chat={selectedChat}
          messages={messages}
          loading={messagesLoading}
          onRefresh={handleRefreshMessages}
        />
      </div>
      <div className="w-72 shrink-0 h-full">
        <AIPanel chat={selectedChat} />
      </div>
    </div>
  );
}
