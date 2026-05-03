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

export interface MessageAttachment {
  url?: string;
  thumbnailUrl?: string;
  w?: number;
  h?: number;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  s?: number;
  mt?: string;
  name?: string;
}

export interface Message {
  id: string;
  chat_id: string;
  text: string;
  sender_id: string;
  is_from_me: boolean;
  timestamp: string;
  type: string;
  // 카톡 앱에서 다운받은 로컬 파일 경로 (사진/동영상/파일에만 있음)
  localFilePath?: string;
  // 첨부 메타데이터 (썸네일/원본 URL 등). manual 채팅엔 없음
  attachment?: MessageAttachment;
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
