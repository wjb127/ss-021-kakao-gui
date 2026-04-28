// Claude Code CLI를 cwd로 spawn하여 비대화형 (-p) 실행
// stdout/stderr를 실시간으로 DB에 누적, exit 시 status 갱신

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  appendClaudeRunOutput,
  finishClaudeRun,
  getSetting,
} from "./store";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

interface RunOptions {
  runId: string;
  cwd: string;
  prompt: string;
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

  let child;
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

  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");

  child.stdout.on("data", (chunk: string) => {
    appendClaudeRunOutput(runId, chunk);
  });
  child.stderr.on("data", (chunk: string) => {
    appendClaudeRunOutput(runId, chunk);
  });

  child.on("error", (err) => {
    appendClaudeRunOutput(runId, `\n[error] ${err.message}\n`);
    finishClaudeRun(runId, "error", null);
  });

  child.on("close", (code) => {
    const status = code === 0 ? "success" : "error";
    appendClaudeRunOutput(runId, `\n[exit ${code}]\n`);
    finishClaudeRun(runId, status, code);
  });
}
