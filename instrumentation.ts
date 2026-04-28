// Next.js 서버 부팅 시 1회 실행 — 폴링 워커 시작

export async function register() {
  // edge runtime에선 better-sqlite3 / kakaocli 못 씀
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startWorker } = await import("./lib/worker");
  startWorker();
}
