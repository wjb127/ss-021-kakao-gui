// 카카오톡 데이터 타입 정의
export type Category = "bot" | "client" | "casual";

export interface Chat {
  id: string;
  display_name: string;
  member_count: number;
  unread_count: number;
  last_message_at: string;
  type?: string;
  category: Category | null;
}

export interface Message {
  id: string;
  chat_id: string;
  text: string;
  sender_id: string;
  is_from_me: boolean;
  timestamp: string;
  type: string;
}

export type Urgency = "Low" | "Medium" | "High" | "Critical";

export interface Analysis {
  summary: string;
  urgency: Urgency;
  todos: string[];
  nextAction: string;
  analyzedAt: string;
}

export interface CategoriesFile {
  [chatId: string]: Category;
}

export interface TodosFile {
  [chatId: string]: Analysis;
}
