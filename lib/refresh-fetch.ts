// 헤더뿐 아니라 본문 다운로드까지 하나의 제한 시간을 적용한다.
export async function fetchRefreshJson<T>(url: string, signal: AbortSignal = AbortSignal.timeout(4500)): Promise<{ data: T; headers: Headers }> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`새로고침 요청 실패: ${response.status}`);
  const data = await response.json() as T;
  return { data, headers: response.headers };
}
