export const BOARD_STAGES = [
  { id: "new", label: "응대필요" },
  { id: "progress", label: "구현진행중" },
  { id: "implemented", label: "작업완료" },
  { id: "answered", label: "응대완료" },
] as const;
export type BoardStage = typeof BOARD_STAGES[number]["id"];
export interface BoardState { stage: BoardStage; revision: number }
export function isBoardStage(value: unknown): value is BoardStage {
  return BOARD_STAGES.some((stage) => stage.id === value);
}
