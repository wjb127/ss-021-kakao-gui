import type { Message } from "./types";

type FeedMember = {
  userId?: string | number;
  nickName?: string;
};

type FeedPayload = {
  feedType?: number;
  hidden?: boolean;
  logId?: string | number;
  eventType?: number;
  inviter?: FeedMember;
  member?: FeedMember;
  members?: FeedMember[];
  bot?: FeedMember;
};

function parseFeedPayload(text: string): FeedPayload | null {
  if (!text.trim().startsWith("{")) return null;
  try {
    const lossless = text.replace(
      /("(?:logId|userId)"\s*:\s*)(\d{16,})/g,
      '$1"$2"',
    );
    const payload = JSON.parse(lossless) as FeedPayload;
    return typeof payload.feedType === "number" ? payload : null;
  } catch {
    return null;
  }
}

function memberName(member?: FeedMember): string | null {
  return member?.nickName?.trim() || null;
}

function memberNames(members?: FeedMember[]): string[] {
  return (members ?? [])
    .map(memberName)
    .filter((name): name is string => !!name);
}

function namesWithSuffix(names: string[]): string {
  return names.length > 0 ? `${names.join(", ")}님` : "참여자";
}

function feedText(payload: FeedPayload): string | null {
  const member = memberName(payload.member);
  const members = memberNames(payload.members);

  switch (payload.feedType) {
    case 1: {
      const inviter = memberName(payload.inviter);
      const invited = namesWithSuffix(members);
      return inviter
        ? `${inviter}님이 ${invited}을 초대했습니다.`
        : `${invited}이 초대되었습니다.`;
    }
    case 2:
      return member ? `${member}님이 나갔습니다.` : "참여자가 나갔습니다.";
    case 3:
      return "상대방이 채팅방을 나갔습니다.";
    case 4:
      return `${namesWithSuffix(members)}이 들어왔습니다.`;
    case 5:
      return "오픈채팅 링크가 삭제되었습니다.";
    case 6:
      return member ? `${member}님이 내보내졌습니다.` : "참여자가 내보내졌습니다.";
    case 7:
      return "채팅방에서 내보내졌습니다.";
    case 8:
      return "채팅방이 삭제되었습니다.";
    case 10:
      return "채팅방 콘텐츠가 변경되었습니다.";
    case 11:
      return member
        ? `${member}님이 부방장으로 지정되었습니다.`
        : "부방장이 지정되었습니다.";
    case 12:
      return member
        ? `${member}님의 부방장 권한이 해제되었습니다.`
        : "부방장 권한이 해제되었습니다.";
    case 13:
      return "운영자에 의해 가려진 메시지입니다.";
    case 14:
      return "삭제된 메시지입니다.";
    case 15:
      return "오픈채팅 방장이 변경되었습니다.";
    case 18:
      return "팀채팅 정보가 변경되었습니다.";
    case 23:
      return payload.bot
        ? `${memberName(payload.bot) ?? "오픈채팅봇"}이 추가되었습니다.`
        : "오픈채팅봇 설정이 변경되었습니다.";
    case 26:
      return "오픈채팅에서 가려진 메시지가 있습니다.";
    default:
      return "카카오톡 시스템 이벤트입니다.";
  }
}

export function normalizeKakaoEvents(messages: Message[]): Message[] {
  const deletedMessages = new Map<string, string>();
  const editedIds = new Set<string>();
  const payloads = new Map<string, FeedPayload>();

  for (const message of messages) {
    if (message.type !== "system") continue;
    const payload = parseFeedPayload(message.text ?? "");
    if (!payload) continue;
    payloads.set(message.id, payload);

    const targetId = String(payload.logId ?? "");
    if (!/^\d+$/.test(targetId)) continue;
    if (payload.feedType === 14) deletedMessages.set(targetId, message.timestamp);
    if (payload.feedType === 25) editedIds.add(targetId);
  }

  return messages
    .filter((message) => {
      const feedType = payloads.get(message.id)?.feedType;
      return feedType !== 16 && feedType !== 25;
    })
    .map((message) => {
      const payload = payloads.get(message.id);
      if (payload) {
        return {
          ...message,
          text: feedText(payload) ?? "카카오톡 시스템 이벤트입니다.",
          type: "system",
          deleted_message_id:
            payload.feedType === 14 ? String(payload.logId ?? "") : undefined,
          edited_message_id:
            payload.feedType === 25 ? String(payload.logId ?? "") : undefined,
        };
      }
      const deletedAt = deletedMessages.get(message.id);
      if (deletedAt) {
        return {
          ...message,
          is_deleted: true,
          deleted_at: message.deleted_at ?? deletedAt,
        };
      }
      return editedIds.has(message.id)
        ? { ...message, is_edited: true }
        : message;
    });
}

export function formatCallEvent(rawType: number, text: string): string {
  let eventType = "";
  let duration = 0;
  try {
    const payload = JSON.parse(text) as { type?: string; duration?: number };
    eventType = payload.type ?? "";
    duration = Number(payload.duration ?? 0);
  } catch {
    return rawType === 51 ? "음성 통화 기록" : "라이브톡 기록";
  }

  const isVoice = rawType === 51;
  const label = isVoice ? "음성 통화" : "라이브톡";
  const subject = isVoice ? "음성 통화가" : "라이브톡이";
  if (eventType.includes("invite")) return `${subject} 시작되었습니다.`;
  if (eventType.includes("deny")) return `${subject} 거절되었습니다.`;
  if (eventType.includes("cancel")) return `${subject} 취소되었습니다.`;
  if (eventType.includes("bye")) {
    return duration > 0
      ? `${subject} 종료되었습니다. (${duration}초)`
      : `${subject} 종료되었습니다.`;
  }
  return `${label} 기록`;
}
