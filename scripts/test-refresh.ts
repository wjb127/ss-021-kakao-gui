import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { startRefreshJob, waitForRefresh } from "../lib/refresh-job";
import { fetchRefreshJson } from "../lib/refresh-fetch";

async function main() {
  let release!: (value: number) => void;
  let calls = 0;
  const run = () => { calls++; return new Promise<number>((resolve) => { release = resolve; }); };
  const job = startRefreshJob("test-slow", run);
  assert.equal(startRefreshJob("test-slow", run), job);
  const start = performance.now();
  await waitForRefresh(job);
  assert.ok(performance.now() - start < 2000);
  assert.equal(job.pending, true);
  assert.equal(calls, 1);
  release(42); await job.promise;
  assert.equal(job.pending, false); assert.equal(job.value, 42);
  assert.equal(startRefreshJob("test-slow", run, 15000), job);
  assert.equal(calls, 1, "완료 직후 자동 갱신은 재조회하지 않는다");
  job.finishedAt = Date.now() - 16000;
  const expired = startRefreshJob("test-slow", async () => { calls++; return 43; }, 15000);
  await expired.promise;
  assert.equal(calls, 2);
  const failed = startRefreshJob("test-slow", async () => { throw new Error("upstream"); });
  await failed.promise;
  assert.equal(failed.failed, true); assert.equal(failed.value, 43);
  const retry = startRefreshJob("test-slow", async () => 44, 15000);
  await retry.promise;
  assert.equal(retry.failed, false, "실패한 조회는 TTL과 무관하게 재시도한다");
  // 헤더만 먼저 도착하고 본문이 멈추는 경우에도 4.5초 내 종료한다.
  const server = createServer((_req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.write('{"data":'); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const address = server.address() as { port: number };
    const began = performance.now();
    await assert.rejects(fetchRefreshJson(`http://127.0.0.1:${address.port}`));
    const elapsed = performance.now() - began;
    assert.ok(elapsed >= 4000 && elapsed < 5000, `본문 시간 제한: ${elapsed}ms`);
    console.log(`PASS: 원본 작업 중복 방지/1.5초 응답/실패 시 기존 값 유지/본문 지연 ${Math.round(elapsed)}ms 제한`);
  } finally { server.closeAllConnections(); server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
