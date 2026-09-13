export const BOARD_STAGES = [
  { id: "new", label: "신규요청" },
  { id: "progress", label: "진행중" },
  { id: "implemented", label: "구현완료" },
  { id: "answered", label: "답변완료" },
] as const;
export type BoardStage = typeof BOARD_STAGES[number]["id"];
export interface BoardState { stage: BoardStage; revision: number }
export function isBoardStage(value: unknown): value is BoardStage {
  return BOARD_STAGES.some((stage) => stage.id === value);
}
