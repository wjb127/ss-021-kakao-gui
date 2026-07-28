import type { Message } from "./types";

function replySourceText(message: Message): string {
  const reply = message.reply;
  if (!reply) return "";
  if (reply.text.trim()) return reply.text.trim();
  if (reply.type === 2 || reply.type === 27) return "[사진]";
  if (reply.type === 3) return "[동영상]";
  if (reply.type === 18) return "[파일]";
  return "[메시지]";
}

export function formatReplyContext(message: Message): string {
  if (!message.reply) return "";
  const sender = message.reply.senderName || `상대(${message.reply.senderId.slice(-4)})`;
  return `[답장 대상: ${sender}: ${replySourceText(message)}]\n`;
}
