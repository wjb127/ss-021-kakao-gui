// Safari의 클릭 권한이 유지되는 동안 쓰기를 시작하고 내용만 비동기로 채운다.
export async function copyDeferredText(loadText: () => Promise<string>): Promise<void> {
  if (!window.isSecureContext) throw new Error("복사하려면 HTTPS 주소로 접속해 주세요.");
  if (!navigator.clipboard?.writeText) throw new Error("Safari 또는 Chrome에서 열어 주세요.");
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    const blob = loadText().then((text) => new Blob([text], { type: "text/plain" }));
    // 권한 거절이 먼저 발생해도 데이터 조회의 거절을 미처리 상태로 남기지 않는다.
    void blob.catch(() => {});
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
  } else {
    await navigator.clipboard.writeText(await loadText());
  }
}
