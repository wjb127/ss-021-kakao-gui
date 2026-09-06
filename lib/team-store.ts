import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getDb } from "./db";
import { TEAM_LIMIT, type TeamUser } from "./team-types";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "kakao_team_session";
export const SESSION_SECONDS = 60 * 60 * 12;
interface UserRow {
  id: string; username: string; display_name: string; role: "admin" | "viewer";
  active: number; password_hash: string | null; revision: number;
}
let schemaReady = false;

export function teamDb() {
  const db = getDb();
  if (schemaReady) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','viewer')), active INTEGER NOT NULL DEFAULT 1,
      password_hash TEXT, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_chat_access (
      user_id TEXT NOT NULL, chat_id TEXT NOT NULL, PRIMARY KEY(user_id, chat_id)
    );
    CREATE TABLE IF NOT EXISTS team_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_invites (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_login_attempts (
      bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, action TEXT NOT NULL,
      target_id TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS team_session_user ON team_sessions(user_id);
  `);
  schemaReady = true;
  return db;
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128) throw new Error("비밀번호는 12~128자로 입력해 주세요.");
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string | null) {
  if (password.length > 128) return false;
  const [salt, encoded] = (hash || "00000000000000000000000000000000:" + "0".repeat(128)).split(":");
  const expected = Buffer.from(encoded, "hex");
  const actual = await scrypt(password, salt, 64) as Buffer;
  return !!hash && expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicUser(row: UserRow): TeamUser {
  const grants = teamDb().prepare("SELECT chat_id FROM team_chat_access WHERE user_id = ? ORDER BY chat_id").all(row.id) as { chat_id: string }[];
  return {
    id: row.id, username: row.username, displayName: row.display_name, role: row.role,
    active: row.active === 1, ready: !!row.password_hash, revision: row.revision,
    chatIds: grants.map((g) => g.chat_id),
  };
}

export function listTeamUsers() {
  return (teamDb().prepare("SELECT * FROM team_users ORDER BY created_at, id").all() as UserRow[]).map(publicUser);
}

export function getTeamUser(id: string) {
  const row = teamDb().prepare("SELECT * FROM team_users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? publicUser(row) : null;
}

export function audit(actorId: string | null, action: string, targetId?: string) {
  teamDb().prepare("INSERT INTO team_audit (actor_id, action, target_id, created_at) VALUES (?, ?, ?, ?)")
    .run(actorId, action, targetId ?? null, new Date().toISOString());
}

function validateProfile(username: string, displayName: string) {
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error("아이디는 영문 소문자·숫자·._- 조합 3~32자로 입력해 주세요.");
  if (!displayName.trim() || displayName.length > 50) throw new Error("이름은 1~50자로 입력해 주세요.");
}

export function createTeamUser(input: { username: string; displayName: string; role: "admin" | "viewer" }, actorId: string | null, bootstrap = false) {
  validateProfile(input.username, input.displayName);
  if (!["admin", "viewer"].includes(input.role)) throw new Error("역할을 확인해 주세요.");
  const db = teamDb();
  return db.transaction(() => {
    const count = (db.prepare("SELECT COUNT(*) AS n FROM team_users WHERE active = 1").get() as { n: number }).n;
    const total = (db.prepare("SELECT COUNT(*) AS n FROM team_users").get() as { n: number }).n;
    if (bootstrap && total > 0) throw new Error("관리자 계정이 이미 있어요.");
    if (!bootstrap && !actorId) throw new Error("관리자 로그인이 필요해요.");
    if (count >= TEAM_LIMIT) throw new Error("활성 계정은 관리자 포함 최대 10명까지 사용할 수 있어요.");
    if (db.prepare("SELECT id FROM team_users WHERE username = ?").get(input.username)) throw new Error("이미 사용 중인 아이디예요.");
    const id = randomUUID();
    db.prepare("INSERT INTO team_users (id, username, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, input.username, input.displayName.trim(), input.role, new Date().toISOString());
    const token = issueInvite(id);
    audit(actorId, "user.create", id);
    return { user: getTeamUser(id)!, token };
  }).immediate();
}

export function issueInvite(userId: string) {
  const db = teamDb();
  const token = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM team_invites WHERE user_id = ?").run(userId);
  db.prepare("INSERT INTO team_invites VALUES (?, ?, ?)").run(tokenHash(token), userId, Date.now() + 24 * 60 * 60 * 1000);
  db.prepare("DELETE FROM team_sessions WHERE user_id = ?").run(userId);
  db.prepare("UPDATE team_users SET password_hash = NULL, revision = revision + 1 WHERE id = ?").run(userId);
  return token;
}

export async function activateAccount(token: string, password: string) {
  if (token.length < 30 || token.length > 100) throw new Error("초대 코드가 올바르지 않거나 만료됐어요.");
  const db = teamDb();
  const invite = db.prepare("SELECT user_id FROM team_invites WHERE token_hash = ? AND expires_at > ?").get(tokenHash(token), Date.now()) as { user_id: string } | undefined;
  if (!invite || !getTeamUser(invite.user_id)?.active) throw new Error("초대 코드가 올바르지 않거나 만료됐어요.");
  const hash = await hashPassword(password);
  return db.transaction(() => {
    // 비밀번호 해시 계산 중 코드 재발급·계정 차단이 일어난 경우도 다시 확인한다.
    const current = db.prepare("SELECT user_id FROM team_invites WHERE token_hash = ? AND expires_at > ?").get(tokenHash(token), Date.now()) as { user_id: string } | undefined;
    if (!current || !getTeamUser(current.user_id)?.active) throw new Error("초대 코드가 올바르지 않거나 만료됐어요.");
    db.prepare("UPDATE team_users SET password_hash = ?, revision = revision + 1 WHERE id = ?").run(hash, current.user_id);
    db.prepare("DELETE FROM team_invites WHERE user_id = ?").run(current.user_id);
    db.prepare("DELETE FROM team_sessions WHERE user_id = ?").run(current.user_id);
    audit(current.user_id, "user.activate", current.user_id);
    return getTeamUser(current.user_id)!;
  }).immediate();
}

export function consumeAttempt(bucket: string, limit = 10) {
  const db = teamDb();
  const now = Date.now();
  return db.transaction(() => {
    db.prepare("DELETE FROM team_login_attempts WHERE expires_at <= ?").run(now);
    const key = tokenHash(bucket);
    const row = db.prepare("SELECT attempts FROM team_login_attempts WHERE bucket = ?").get(key) as { attempts: number } | undefined;
    if ((row?.attempts ?? 0) >= limit) return false;
    db.prepare("INSERT INTO team_login_attempts VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1")
      .run(key, now + 15 * 60 * 1000);
    return true;
  }).immediate();
}

export async function authenticate(username: string, password: string) {
  const db = teamDb();
  const row = db.prepare("SELECT * FROM team_users WHERE username = ?").get(username) as UserRow | undefined;
  const valid = await verifyPassword(password, row?.password_hash ?? null);
  if (!valid || !row || !row.active) return null;
  const current = db.prepare("SELECT * FROM team_users WHERE id = ? AND active = 1 AND password_hash = ?").get(row.id, row.password_hash) as UserRow | undefined;
  return current ? publicUser(current) : null;
}

export function createSession(userId: string) {
  const db = teamDb();
  const token = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM team_sessions WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO team_sessions VALUES (?, ?, ?)").run(tokenHash(token), userId, Date.now() + SESSION_SECONDS * 1000);
  return token;
}

export function sessionUser(token?: string) {
  if (!token || token.length > 100) return null;
  const row = teamDb().prepare(`SELECT u.* FROM team_sessions s JOIN team_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`).get(tokenHash(token), Date.now()) as UserRow | undefined;
  return row ? publicUser(row) : null;
}

export function revokeSession(token: string) {
  teamDb().prepare("DELETE FROM team_sessions WHERE token_hash = ?").run(tokenHash(token));
}

export function canReadChat(user: TeamUser, chatId: string) {
  return user.active && (user.role === "admin" || user.chatIds.includes(chatId));
}

export function updateTeamUser(actor: TeamUser, id: string, input: { displayName: string; role: "admin" | "viewer"; active: boolean; chatIds: string[]; revision: number }) {
  const db = teamDb();
  return db.transaction(() => {
    const previous = getTeamUser(id);
    if (!previous) throw new Error("사용자를 찾을 수 없어요.");
    if (previous.revision !== input.revision) throw new Error("다른 관리자가 변경했어요. 새로고침 후 다시 저장해 주세요.");
    validateProfile(previous.username, input.displayName);
    if (!["admin", "viewer"].includes(input.role) || typeof input.active !== "boolean") throw new Error("계정 설정을 확인해 주세요.");
    if (!Array.isArray(input.chatIds) || input.chatIds.length > 5000 || input.chatIds.some((id) => typeof id !== "string" || !/^(\d+|manual_[\w-]+)$/.test(id))) throw new Error("조회할 채팅방을 확인해 주세요.");
    if (actor.id === id && (!input.active || input.role !== "admin")) throw new Error("자신의 관리자 권한은 해제할 수 없어요.");
    const admins = (db.prepare("SELECT COUNT(*) AS n FROM team_users WHERE role = 'admin' AND active = 1").get() as { n: number }).n;
    if (previous.active && previous.role === "admin" && (!input.active || input.role !== "admin") && admins <= 1) throw new Error("최소 한 명의 관리자가 필요해요.");
    const count = (db.prepare("SELECT COUNT(*) AS n FROM team_users WHERE active = 1").get() as { n: number }).n;
    if (!previous.active && input.active && count >= TEAM_LIMIT) throw new Error("활성 계정은 최대 10명이에요.");
    db.prepare("UPDATE team_users SET display_name = ?, role = ?, active = ?, revision = revision + 1 WHERE id = ?")
      .run(input.displayName.trim(), input.role, Number(input.active), id);
    db.prepare("DELETE FROM team_chat_access WHERE user_id = ?").run(id);
    const insert = db.prepare("INSERT INTO team_chat_access (user_id, chat_id) VALUES (?, ?)");
    for (const chatId of new Set(input.chatIds)) insert.run(id, chatId);
    if (!input.active || previous.role !== input.role) db.prepare("DELETE FROM team_sessions WHERE user_id = ?").run(id);
    audit(actor.id, "user.update", id);
    return getTeamUser(id)!;
  }).immediate();
}
