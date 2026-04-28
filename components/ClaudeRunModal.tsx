"use client";

// Claude Code 원격 실행 모달
// 지시문 입력 → /api/claude-trigger → runId → 1초 폴링으로 output/status 갱신

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  chatId: string;
  displayName: string;
  projectPath: string;
}

interface ClaudeRun {
  id: string;
  chat_id: string;
  project_path: string;
  prompt: string;
  output: string;
  status: "running" | "success" | "error";
  exit_code: number | null;
  started_at: string;
  finished_at: string | null;
}

export function ClaudeRunModal({ open, onClose, chatId, displayName, projectPath }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const [instruction, setInstruction] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<ClaudeRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 모달 닫힐 때 상태 리셋
  useEffect(() => {
    if (!open) {
      setInstruction("");
      setRunId(null);
      setRun(null);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  // ESC + 외부 클릭
  useEffect(() => {
    if (!open) return;
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", click);
    };
  }, [open, onClose]);

  // 폴링: runId 있고 status !== running 아닐 때까지
  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/claude-runs?id=${runId}`);
        const data = (await res.json()) as ClaudeRun;
        if (stopped) return;
        setRun(data);
        if (data.status === "running") {
          setTimeout(tick, 1000);
        }
      } catch {
        if (!stopped) setTimeout(tick, 2000);
      }
    };
    tick();
    return () => { stopped = true; };
  }, [runId]);

  // output 갱신될 때마다 자동 스크롤
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [run?.output]);

  async function execute() {
    if (!instruction.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/claude-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          displayName,
          projectPath,
          instruction: instruction.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "트리거 실패");
        setSubmitting(false);
        return;
      }
      setRunId(data.runId);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const statusBadge = run?.status === "running"
    ? { label: "실행 중", cls: "bg-yellow-100 text-yellow-800" }
    : run?.status === "success"
      ? { label: "완료", cls: "bg-green-100 text-green-700" }
      : run?.status === "error"
        ? { label: "에러", cls: "bg-red-100 text-red-700" }
        : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        ref={ref}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl border border-[#D6D8DF] flex flex-col max-h-[90vh]"
      >
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-[#D6D8DF] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#1A1F36] truncate">Claude 실행</div>
            <div className="text-[10px] text-[#9CA3AF] truncate" title={projectPath}>
              {projectPath}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-[#1A1F36] text-xl leading-none shrink-0"
          >
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 overflow-y-auto flex-1 min-h-0">
          {!runId ? (
            <>
              <div className="text-xs text-[#6B7280] mb-2">
                지시문을 입력하면 KAKAO_CONTEXT.md가 갱신되고 Claude가 cwd로 실행됨
              </div>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="예: 고객이 요청한 기능을 src/ 안에 구현해줘. 작업 후 KAKAO_CONTEXT.md의 다음 액션도 업데이트해줘"
                className="w-full text-sm text-[#1A1F36] bg-[#F5F6F8] border border-[#D6D8DF] rounded p-3 resize-none focus:outline-none focus:border-[#2959AA] leading-5"
                rows={6}
                autoFocus
              />
              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mt-2">
                  {error}
                </div>
              )}
              <div className="text-[10px] text-[#9CA3AF] mt-2 leading-tight">
                권한 스킵은 설정 모달에서 토글. OFF면 claude가 권한 묻고 멈출 수 있음
              </div>
            </>
          ) : (
            <>
              {/* 상태 + 지시문 */}
              <div className="flex items-center gap-2 mb-2">
                {statusBadge && (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${statusBadge.cls}`}>
                    {statusBadge.label}
                  </span>
                )}
                {run?.exit_code !== null && run?.exit_code !== undefined && (
                  <span className="text-[10px] text-[#9CA3AF]">exit {run.exit_code}</span>
                )}
              </div>

              {/* 출력 */}
              <pre
                ref={outputRef}
                className="text-[11px] text-[#1A1F36] font-mono whitespace-pre-wrap break-words bg-[#F5F6F8] border border-[#D6D8DF] rounded p-3 overflow-y-auto leading-4"
                style={{ maxHeight: "50vh", minHeight: "200px" }}
              >
                {run?.output || "(출력 대기 중...)"}
              </pre>
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-[#D6D8DF] flex justify-end gap-2">
          {!runId ? (
            <>
              <button
                onClick={onClose}
                className="text-xs px-3 py-1.5 rounded bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
              >
                취소
              </button>
              <button
                onClick={execute}
                disabled={!instruction.trim() || submitting}
                className="text-xs px-3 py-1.5 rounded bg-[#2959AA] text-white hover:bg-[#1F4485] disabled:bg-[#9CA3AF]"
              >
                {submitting ? "실행 중..." : "실행"}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
            >
              닫기 (백그라운드 계속 실행)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
