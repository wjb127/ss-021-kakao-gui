export interface TeamUser {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "viewer";
  active: boolean;
  ready: boolean;
  revision: number;
  chatIds: string[];
}

export const TEAM_LIMIT = 10;
