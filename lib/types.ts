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
  imageUrls?: string[];
  thumbnailUrls?: string[];
  w?: number;
  h?: number;
  wl?: number[];
  hl?: number[];
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  thumbnailWidths?: number[];
  thumbnailHeights?: number[];
  s?: number;
  sl?: number[];
  mt?: string;
  mtl?: string[];
  name?: string;
}

export interface Message {
  id: string;
  chat_id: string;
  text: string;
  sender_id: string;
  sender_name?: string;
  is_from_me: boolean;
  timestamp: string;
  type: string;
  // 카카오 삭제 이벤트가 가리키는 원본 메시지 ID. 캐시 정리에 사용한다.
  deleted_message_id?: string;
  // 카카오 수정 이벤트가 가리키는 원본 메시지 ID. 캐시 정리에 사용한다.
  edited_message_id?: string;
  is_edited?: boolean;
  reply?: {
    messageId: string;
    senderId: string;
    senderName?: string;
    text: string;
    type: number;
  };
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

// ─── 고객 요청 (카톡 자동 추출) ───────────────────────────────────────────────

export type RequestKind =
  | "fix"      // 수정 요청
  | "feature"  // 신규 기능/추가
  | "asset"    // 자료·파일 전달/요청
  | "question" // 질문 (답변 필요)
  | "payment"  // 입금/정산 관련
  | "info";    // 단순 공지·정보

export type RequestStatus = "open" | "in_progress" | "done" | "dismissed";

export interface ClientRequest {
  id: string;
  chatId: string;
  sourceMsgId: string | null;
  title: string;
  detail: string;
  kind: RequestKind;
  status: RequestStatus;
  projectPath: string | null;
  confidence: number | null;
  runId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoriesFile {
  [chatId: string]: Category;
}

export interface TodosFile {
  [chatId: string]: Analysis;
}
