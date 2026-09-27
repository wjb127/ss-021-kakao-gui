import type { ChatWork } from "./work-types";
import type { BoardStage } from "./board-types";

export type AgendaGroup = "overdue" | "today" | "week" | "later" | "undated";
export interface AgendaTask {
  id: string; chatId: string; chatName: string; assigneeId: string; assigneeName: string;
  stage: BoardStage; title: string; date: string; kind: "연락" | "마감" | "할 일";
}
export function koreaDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
}
export function agendaGroup(date: string, today: string): AgendaGroup {
  if (!date) return "undated";
  if (date < today) return "overdue";
  if (date === today) return "today";
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + (7 - end.getUTCDay()) % 7);
  return date <= end.toISOString().slice(0, 10) ? "week" : "later";
}
export function workTasks(work: ChatWork, context: Pick<AgendaTask, "chatId" | "chatName" | "assigneeId" | "assigneeName" | "stage">): AgendaTask[] {
  // 응대가 끝난 대화와 완료 체크된 항목은 할 일 집계에서 제외한다.
  if (context.stage === "answered") return [];
  const tasks: AgendaTask[] = [];
  const add = (id: string, title: string, date: string, kind: AgendaTask["kind"]) => tasks.push({ ...context, id: `${context.chatId}:${id}`, title, date, kind });
  if (work.nextContact) add("contact", "고객에게 연락", work.nextContact, "연락");
  if (work.deadline) add("deadline", "작업 마감", work.deadline, "마감");
  for (const item of work.items) if (!item.done) add(`item:${item.id}`, item.title, work.deadline, "할 일");
  return tasks;
}
