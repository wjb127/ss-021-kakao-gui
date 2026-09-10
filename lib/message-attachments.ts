import type { Message } from "./types";

// 카카오 파일 메시지를 사진으로 저장했던 캐시도 읽는 시점에 보정한다.
export function normalizeAttachmentMessage(message: Message): Message {
  const attachment = message.attachment;
  const namedFile = !!attachment?.name && !!attachment.url && !attachment.imageUrls?.length;
  const legacyFile = ["unknown", "photo"].includes(message.type) && /\.(pdf|txt|zip|hwp|hwpx|docx?|xlsx?|pptx?|csv|rtf|md|json|xml|psd|ai|7z)$/i.test(message.text.trim());
  if (namedFile || legacyFile) return { ...message, type: "file" };
  return message;
}

export function mergeExportMessages(current: Message[], exported: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of exported) {
    const previous = byId.get(message.id);
    byId.set(message.id, normalizeAttachmentMessage({
      ...previous, ...message,
      localFilePath: message.localFilePath ?? previous?.localFilePath,
      attachment: message.attachment ?? previous?.attachment,
    }));
  }
  return [...byId.values()];
}
