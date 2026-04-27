"use client";

import { useCallback, useEffect, useState } from "react";
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

  // 채팅 목록 로드
  useEffect(() => {
    fetch("/api/chats")
      .then((r) => r.json())
      .then(setChats)
      .catch(console.error);
  }, []);

  // 메시지 로드 (10명 이하 방은 50일, 그 외 10일)
  useEffect(() => {
    if (!selectedChatId) return;
    const chat = chats.find((c) => c.id === selectedChatId);
    const memberCount = chat?.member_count ?? 0;
    setMessagesLoading(true);
    fetch(`/api/messages?chatId=${selectedChatId}&memberCount=${memberCount}`)
      .then((r) => r.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []))
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }, [selectedChatId, chats]);

  const handleSelect = useCallback((id: string) => {
    setSelectedChatId(id);
    setMessages([]);
  }, []);

  const handleCategoryChange = useCallback(
    async (chatId: string, category: Category | null) => {
      // 로컬 상태 즉시 반영
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
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <div className="w-64 shrink-0 h-full">
        <ChatList
          chats={chats}
          selectedChatId={selectedChatId}
          onSelect={handleSelect}
          filter={filter}
          onFilterChange={setFilter}
          onCategoryChange={handleCategoryChange}
        />
      </div>
      <div className="flex-1 h-full min-w-0">
        <ChatView
          chat={selectedChat}
          messages={messages}
          loading={messagesLoading}
        />
      </div>
      <div className="w-72 shrink-0 h-full">
        <AIPanel chat={selectedChat} />
      </div>
    </div>
  );
}
