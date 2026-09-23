export interface WorkItem {
  id: string;
  title: string;
  done: boolean;
  sourceId: string | null;
}
export interface ChatWork {
  revision: number;
  assigneeId: string;
  nextContact: string;
  deadline: string;
  waitingFor: string;
  items: WorkItem[];
}
export const EMPTY_WORK: ChatWork = { revision: 0, assigneeId: "", nextContact: "", deadline: "", waitingFor: "", items: [] };
