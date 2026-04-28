// Claude Code CLI를 cwd로 spawn하여 비대화형 (-p) 실행
// stdout/stderr를 실시간으로 DB에 누적, exit 시 status 갱신

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import {
  appendClaudeRunOutput,
  finishClaudeRun,
  getSetting,
} from "./store";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10분 hard timeout

// HMR 안전 — 활성 child process 레지스트리 (글로벌)
const REG_KEY = "__claudeRunRegistry__";
interface RegEntry {
  child: ChildProcess;
  timeout: NodeJS.Timeout;
  cancelled: boolean;
}
type GlobalReg = { [REG_KEY]?: Map<string, RegEntry> };

function getRegistry(): Map<string, RegEntry> {
  const g = globalThis as GlobalReg;
  if (!g[REG_KEY]) g[REG_KEY] = new Map();
  return g[REG_KEY]!;
}

interface RunOptions {
  runId: string;
  cwd: string;
  prompt: string;
}

export function cancelClaudeRun(runId: string): boolean {
  const reg = getRegistry();
  const entry = reg.get(runId);
  if (!entry) return false;
  entry.cancelled = true;
  try {
    entry.child.kill("SIGTERM");
    setTimeout(() => {
      if (!entry.child.killed) entry.child.kill("SIGKILL");
    }, 3000);
  } catch {
    // 이미 종료
  }
  return true;
}

export function startClaudeRun({ runId, cwd, prompt }: RunOptions): void {
  if (!existsSync(cwd)) {
    appendClaudeRunOutput(runId, `[error] cwd 없음: ${cwd}\n`);
    finishClaudeRun(runId, "error", null);
    return;
  }

  const skipPerms = getSetting("claude_skip_permissions") === "1";
  const args: string[] = ["-p", prompt];
  if (skipPerms) args.push("--dangerously-skip-permissions");

  appendClaudeRunOutput(
    runId,
    `[claude] cwd=${cwd} skipPerms=${skipPerms}\n[prompt]\n${prompt}\n[output]\n`,
  );

  let child: ChildProcess;
  try {
    child = spawn(CLAUDE_BIN, args, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    appendClaudeRunOutput(runId, `[spawn 실패] ${String(e)}\n`);
    finishClaudeRun(runId, "error", null);
    return;
  }

  const reg = getRegistry();
  const timeout = setTimeout(() => {
    const entry = reg.get(runId);
    if (!entry) return;
    appendClaudeRunOutput(runId, `\n[timeout] ${RUN_TIMEOUT_MS / 1000}s 초과 — kill\n`);
    entry.cancelled = true;
    try {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 3000);
    } catch {
      // ignore
    }
  }, RUN_TIMEOUT_MS);
  const entry: RegEntry = { child, timeout, cancelled: false };
  reg.set(runId, entry);

  child.stdout?.setEncoding("utf-8");
  child.stderr?.setEncoding("utf-8");

  child.stdout?.on("data", (chunk: string) => {
    appendClaudeRunOutput(runId, chunk);
  });
  child.stderr?.on("data", (chunk: string) => {
    appendClaudeRunOutput(runId, chunk);
  });

  child.on("error", (err) => {
    clearTimeout(timeout);
    reg.delete(runId);
    appendClaudeRunOutput(runId, `\n[error] ${err.message}\n`);
    finishClaudeRun(runId, "error", null);
  });

  child.on("close", (code) => {
    clearTimeout(timeout);
    reg.delete(runId);
    const status = entry.cancelled ? "cancelled" : code === 0 ? "success" : "error";
    appendClaudeRunOutput(runId, `\n[exit ${code}${entry.cancelled ? " — cancelled" : ""}]\n`);
    finishClaudeRun(runId, status, code);
  });
}
