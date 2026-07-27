// Next.js 서버 부팅 시 1회 실행 — orphan run 회수 + 폴링 워커 시작

export async function register() {
  // edge runtime에선 better-sqlite3 / kakaocli 못 씀
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 이전 프로세스에서 running으로 남은 claude_runs 정리 (좀비 방지)
  try {
    const { reapOrphanRuns } = await import("./lib/store");
    const reaped = reapOrphanRuns();
    if (reaped > 0) {
      console.log(`[boot] orphan claude_run ${reaped}건 정리`);
    }
  } catch (e) {
    console.error("[boot] orphan run 정리 실패:", e);
  }

  const { startWorker } = await import("./lib/worker");
  startWorker();
}
