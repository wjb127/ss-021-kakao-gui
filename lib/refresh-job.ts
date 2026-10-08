// 느린 원본 조회는 한 번만 실행하고 화면에는 제한 시간 안에 상태를 돌려준다.
export interface RefreshJob<T> {
  pending: boolean;
  failed: boolean;
  value?: T;
  finishedAt: number;
  promise: Promise<void>;
}
const state = globalThis as typeof globalThis & { __inboxRefreshJobs?: Map<string, RefreshJob<unknown>> };
const jobs = state.__inboxRefreshJobs ??= new Map();
export function getRefreshJob<T>(key: string): RefreshJob<T> | undefined {
  return jobs.get(key) as RefreshJob<T> | undefined;
}
export function startRefreshJob<T>(key: string, run: () => Promise<T>, maxAgeMs = 0): RefreshJob<T> {
  const current = getRefreshJob<T>(key);
  if (current?.pending) return current;
  // 자동 갱신만 짧게 재사용한다. 수동 새로고침은 기본값 0으로 즉시 조회한다.
  if (current && !current.failed && maxAgeMs > 0 && Date.now() - current.finishedAt < maxAgeMs) return current;
  for (const [id, job] of jobs) if (!job.pending && Date.now() - job.finishedAt > 60_000) jobs.delete(id);
  const job: RefreshJob<T> = { pending: true, failed: false, value: current?.value, finishedAt: 0, promise: Promise.resolve() };
  jobs.set(key, job);
  job.promise = Promise.resolve().then(run).then((value) => { job.value = value; })
    .catch(() => { job.failed = true; })
    .finally(() => { job.pending = false; job.finishedAt = Date.now(); });
  return job;
}
export async function waitForRefresh(job: RefreshJob<unknown>, milliseconds = 1500) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([job.promise, new Promise<void>((resolve) => { timer = setTimeout(resolve, milliseconds); })]); }
  finally { clearTimeout(timer); }
}
