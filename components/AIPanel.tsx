"use client";

// AI 분석 패널 - 우측
import { useEffect, useRef, useState } from "react";
import type { Analysis, Chat, Urgency } from "@/lib/types";
import { ClaudeRunModal } from "./ClaudeRunModal";

interface Props {
  chat: Chat | null;
  onCloseMobile?: () => void;
}

const URGENCY_STYLE: Record<Urgency, string> = {
  Low:      "bg-[#E8E9EC] text-[#6B7280]",
  Medium:   "bg-yellow-100 text-yellow-800 border border-yellow-300",
  High:     "bg-orange-100 text-orange-800 border border-orange-300",
  Critical: "bg-red-100 text-red-700 border border-red-300",
};

function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString("ko-KR"); } catch { return iso; }
}

type Tab = "분석" | "답변" | "메모" | "연동";
type Tone = "formal" | "casual" | "brief";

const TONE_LABEL: Record<Tone, string> = {
  formal: "정중",
  casual: "친근",
  brief: "간결",
};

export function AIPanel({ chat, onCloseMobile }: Props) {
  const [tab, setTab] = useState<Tab>("분석");

  // ── 분석 탭 ──────────────────────────────────────────────
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedSet, setCheckedSet] = useState<Set<number>>(new Set());
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // ── 메모 탭 ──────────────────────────────────────────────
  const [memo, setMemo] = useState("");
  const [memoSaved, setMemoSaved] = useState(false);
  const memoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 답변 탭 ──────────────────────────────────────────────
  const [replyTone, setReplyTone] = useState<Tone>("casual");
  const [replyInstruction, setReplyInstruction] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyCopied, setReplyCopied] = useState(false);
  const [sendEnabled, setSendEnabled] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [sendStatus, setSendStatus] = useState<"" | "sending" | "sent" | "fail">("");
  const [sendError, setSendError] = useState<string | null>(null);

  // ── 연동 탭 ──────────────────────────────────────────────
  const [projectPaths, setProjectPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [exportingPath, setExportingPath] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<Record<string, string>>({});
  const [claudeModalPath, setClaudeModalPath] = useState<string | null>(null);

  // 채팅 변경 시 전체 초기화 + 데이터 로드
  useEffect(() => {
    setAnalysis(null);
    setCheckedSet(new Set());
    setAnalyzeError(null);
    setMemo("");
    setMemoSaved(false);
    setProjectPaths([]);
    setNewPath("");
    setExportStatus({});
    setReplyDraft("");
    setReplyInstruction("");
    setReplyError(null);
    setReplyCopied(false);
    setSendStatus("");
    setSendError(null);
    setSendConfirmOpen(false);

    // settings에서 send_enabled 가져오기
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setSendEnabled(s.send_enabled === "1"))
      .catch(() => setSendEnabled(false));

    if (!chat || chat.category !== "client") return;

    let cancelled = false;
    (async () => {
      try {
        const [todosRes, pathRes, memoRes] = await Promise.all([
          fetch(`/api/todos?chatId=${encodeURIComponent(chat.id)}`),
          fetch(`/api/project-mapping?chatId=${encodeURIComponent(chat.id)}`),
          fetch(`/api/memo?chatId=${encodeURIComponent(chat.id)}`),
        ]);
        const todosData = (await todosRes.json()) as Analysis | null;
        const pathData  = (await pathRes.json()) as { paths: string[] };
        const memoData  = (await memoRes.json()) as { content: string };
        if (!cancelled) {
          setAnalysis(todosData || null);
          setProjectPaths(pathData.paths ?? []);
          setMemo(memoData.content ?? "");
        }
      } catch { /* 무시 */ }
    })();
    return () => { cancelled = true; };
  }, [chat?.id, chat?.category]);

  // ── 분석 ─────────────────────────────────────────────────
  async function runAnalyze() {
    if (!chat) return;
    setLoading(true);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id }),
      });
      const data = await res.json();
      if (!res.ok) setAnalyzeError(data?.error || "분석 실패");
      else { setAnalysis(data as Analysis); setCheckedSet(new Set()); }
    } catch (e) { setAnalyzeError(String(e)); }
    finally { setLoading(false); }
  }

  // ── 메모 자동저장 (1s debounce) ──────────────────────────
  function handleMemoChange(val: string) {
    setMemo(val);
    setMemoSaved(false);
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(async () => {
      if (!chat) return;
      await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, content: val }),
      });
      setMemoSaved(true);
      setTimeout(() => setMemoSaved(false), 1500);
    }, 1000);
  }

  // ── 답변 초안 생성 ───────────────────────────────────────
  async function runDraftReply() {
    if (!chat) return;
    setReplyLoading(true);
    setReplyError(null);
    setReplyDraft("");
    try {
      const res = await fetch("/api/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          tone: replyTone,
          instruction: replyInstruction.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) setReplyError(data?.error || "초안 생성 실패");
      else setReplyDraft(data.draft as string);
    } catch (e) {
      setReplyError(String(e));
    } finally {
      setReplyLoading(false);
    }
  }

  async function copyDraft() {
    if (!replyDraft) return;
    await navigator.clipboard.writeText(replyDraft);
    setReplyCopied(true);
    setTimeout(() => setReplyCopied(false), 1500);
  }

  async function confirmSend() {
    if (!chat || !replyDraft.trim()) return;
    setSendConfirmOpen(false);
    setSendStatus("sending");
    setSendError(null);
    try {
      const res = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          text: replyDraft,
          confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendStatus("fail");
        setSendError(data?.error || "발송 실패");
      } else {
        setSendStatus("sent");
        setTimeout(() => setSendStatus(""), 2500);
      }
    } catch (e) {
      setSendStatus("fail");
      setSendError(String(e));
    }
  }

  // ── 연동 ─────────────────────────────────────────────────
  async function addPath() {
    if (!chat || !newPath.trim()) return;
    const res = await fetch("/api/project-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chat.id, projectPath: newPath.trim() }),
    });
    const data = (await res.json()) as { paths: string[] };
    setProjectPaths(data.paths ?? []);
    setNewPath("");
  }

  async function removePath(p: string) {
    if (!chat) return;
    const res = await fetch("/api/project-mapping", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chat.id, projectPath: p }),
    });
    const data = (await res.json()) as { paths: string[] };
    setProjectPaths(data.paths ?? []);
  }

  async function exportContext(p: string) {
    if (!chat) return;
    setExportingPath(p);
    try {
      const res = await fetch("/api/save-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, displayName: chat.display_name, projectPath: p }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      setExportStatus((prev) => ({
        ...prev,
        [p]: res.ok ? "✓ 저장됨" : `오류: ${data.error || "실패"}`,
      }));
    } catch (e) {
      setExportStatus((prev) => ({ ...prev, [p]: `오류: ${String(e)}` }));
    } finally { setExportingPath(null); }
  }

  // ── 빈 상태 ──────────────────────────────────────────────
  if (!chat) {
    return (
      <div className="w-full h-full bg-white border-l border-[#D6D8DF] p-4 text-xs text-[#6B7280] relative">
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden absolute top-2 right-2 text-[#9CA3AF] hover:text-[#1A1F36] text-xl leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        )}
        채팅을 선택하면 AI 분석이 표시됩니다
      </div>
    );
  }

  if (chat.category !== "client") {
    return (
      <div className="w-full h-full bg-white border-l border-[#D6D8DF] p-4 relative">
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden absolute top-2 right-2 text-[#9CA3AF] hover:text-[#1A1F36] text-xl leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        )}
        <div className="text-xs text-[#6B7280]">
          AI 분석은 <span className="text-[#2959AA] font-medium">고객</span> 카테고리 채팅에만
          제공됩니다
        </div>
        <div className="text-[10px] text-[#9CA3AF] mt-2">
          왼쪽 채팅 옆 배지를 클릭해서 카테고리를 [고객]으로 변경하세요
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white border-l border-[#D6D8DF] flex flex-col">
      {/* 헤더 */}
      <div className="px-3 pt-3 pb-0 border-b border-[#D6D8DF] bg-white">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="text-xs font-semibold text-[#1A1F36] truncate flex-1">
            {chat.display_name || `(채팅방)`}
          </div>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden text-[#9CA3AF] hover:text-[#1A1F36] text-lg leading-none shrink-0"
              aria-label="닫기"
            >
              ×
            </button>
          )}
        </div>
        {/* 탭 */}
        <div className="flex gap-0">
          {(["분석", "답변", "메모", "연동"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-[11px] py-1.5 transition-colors border-b-2 ${
                tab === t
                  ? "border-[#2959AA] text-[#2959AA] font-semibold"
                  : "border-transparent text-[#6B7280] hover:text-[#1A1F36]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 overflow-y-auto">

        {/* ── 분석 탭 ── */}
        {tab === "분석" && (
          <div className="p-3 space-y-3">
            {!analysis && !loading && (
              <button
                onClick={runAnalyze}
                className="w-full py-2 bg-[#2959AA] hover:bg-[#1D3F7A] text-white text-sm rounded transition-colors"
              >
                AI 분석하기
              </button>
            )}
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block w-6 h-6 border-2 border-[#D6D8DF] border-t-[#2959AA] rounded-full animate-spin" />
                <div className="text-xs text-[#6B7280] mt-2">분석 중...</div>
              </div>
            )}
            {analyzeError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {analyzeError}
              </div>
            )}
            {analysis && !loading && (
              <>
                <div>
                  <div className="text-[10px] text-[#6B7280] mb-1">요약</div>
                  <div className="text-sm text-[#1A1F36] bg-[#F5F6F8] border border-[#D6D8DF] rounded p-2">
                    {analysis.summary}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#6B7280] mb-1">긴급도</div>
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded ${URGENCY_STYLE[analysis.urgency]}`}>
                    {analysis.urgency}
                  </span>
                </div>
                {analysis.nextAction && (
                  <div>
                    <div className="text-[10px] text-[#6B7280] mb-1">다음 액션</div>
                    <div className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-2 font-medium">
                      {analysis.nextAction}
                    </div>
                  </div>
                )}
                {analysis.todos.length > 0 && (
                  <div>
                    <div className="text-[10px] text-[#6B7280] mb-1">TODO ({analysis.todos.length})</div>
                    <ul className="space-y-1">
                      {analysis.todos.map((t, i) => {
                        const checked = checkedSet.has(i);
                        return (
                          <li key={i} className="flex items-start gap-2 text-xs text-[#1A1F36] bg-[#F5F6F8] border border-[#D6D8DF] rounded p-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = new Set(checkedSet);
                                if (checked) next.delete(i); else next.add(i);
                                setCheckedSet(next);
                              }}
                              className="mt-0.5 shrink-0 accent-[#2959AA]"
                            />
                            <span className={checked ? "line-through text-[#9CA3AF]" : ""}>{t}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <div className="pt-2 border-t border-[#D6D8DF] flex items-center justify-between">
                  <span className="text-[10px] text-[#9CA3AF]">{formatTimestamp(analysis.analyzedAt)}</span>
                  <button
                    onClick={runAnalyze}
                    className="text-[10px] px-2 py-1 bg-[#E8E9EC] hover:bg-[#D6D8DF] text-[#1A1F36] rounded transition-colors"
                  >
                    재분석
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 답변 탭 ── */}
        {tab === "답변" && (
          <div className="p-3 space-y-3">
            {/* 톤 토글 */}
            <div>
              <div className="text-[10px] text-[#6B7280] mb-1">톤</div>
              <div className="flex gap-1">
                {(["formal", "casual", "brief"] as Tone[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setReplyTone(t)}
                    className={`flex-1 py-1.5 text-[11px] rounded transition-colors ${
                      replyTone === t
                        ? "bg-[#2959AA] text-white"
                        : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
                    }`}
                  >
                    {TONE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* 추가 지시 */}
            <div>
              <div className="text-[10px] text-[#6B7280] mb-1">추가 지시 (선택)</div>
              <textarea
                value={replyInstruction}
                onChange={(e) => setReplyInstruction(e.target.value)}
                placeholder="예: 견적 보내겠다고 말하기 / 일정 다음 주로 미루기"
                className="w-full text-xs text-[#1A1F36] bg-[#F5F6F8] border border-[#D6D8DF] rounded p-2 resize-none focus:outline-none focus:border-[#2959AA] placeholder-[#9CA3AF] leading-5"
                rows={2}
              />
            </div>

            {/* 생성 버튼 */}
            <button
              onClick={runDraftReply}
              disabled={replyLoading}
              className="w-full py-2 bg-[#2959AA] hover:bg-[#1D3F7A] text-white text-sm rounded transition-colors disabled:bg-[#9CA3AF]"
            >
              {replyLoading ? "생성 중..." : replyDraft ? "다시 생성" : "답변 초안 생성"}
            </button>

            {replyError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {replyError}
              </div>
            )}

            {/* 초안 */}
            {replyDraft && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] text-[#6B7280]">초안 (편집 가능)</div>
                  <button
                    onClick={copyDraft}
                    className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                      replyCopied
                        ? "bg-green-500 text-white"
                        : "bg-[#E8E9EC] hover:bg-[#D6D8DF] text-[#1A1F36]"
                    }`}
                  >
                    {replyCopied ? "✓ 복사됨" : "복사"}
                  </button>
                </div>
                <textarea
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  className="w-full text-sm text-[#1A1F36] bg-white border border-[#D6D8DF] rounded p-2 resize-none focus:outline-none focus:border-[#2959AA] leading-5"
                  rows={8}
                />
                <div className="text-[9px] text-[#9CA3AF] mt-1 leading-tight">
                  카톡에 붙여넣기 전 반드시 확인. AI가 가격·일정 임의 약속할 수 있음
                </div>

                {/* 카톡 자동 발송 */}
                <div className="mt-2 pt-2 border-t border-[#E8E9EC]">
                  <button
                    onClick={() => setSendConfirmOpen(true)}
                    disabled={!sendEnabled || sendStatus === "sending" || !replyDraft.trim() || chat.id.startsWith("manual_")}
                    className={`w-full py-1.5 text-xs rounded transition-colors ${
                      sendStatus === "sent"
                        ? "bg-green-500 text-white"
                        : sendStatus === "fail"
                          ? "bg-red-500 text-white"
                          : "bg-orange-500 hover:bg-orange-600 text-white disabled:bg-[#9CA3AF]"
                    }`}
                    title={
                      !sendEnabled
                        ? "설정 모달에서 자동발송 활성화 필요"
                        : chat.id.startsWith("manual_")
                          ? "수동 채팅(크몽 등)은 카톡 발송 불가"
                          : "카톡 입력란에 붙여넣고 엔터"
                    }
                  >
                    {sendStatus === "sending"
                      ? "발송 중..."
                      : sendStatus === "sent"
                        ? "✓ 발송 완료"
                        : sendStatus === "fail"
                          ? "✗ 실패"
                          : "카톡으로 발송 (위험)"}
                  </button>
                  {sendError && (
                    <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded p-1.5 mt-1">
                      {sendError}
                    </div>
                  )}
                  {!sendEnabled && (
                    <div className="text-[9px] text-[#9CA3AF] mt-1 leading-tight">
                      설정 → 카톡 자동발송 토글 ON 필요
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 발송 확인 모달 */}
            {sendConfirmOpen && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-[#D6D8DF] p-5">
                  <div className="text-sm font-bold text-[#1A1F36] mb-2">
                    카톡 발송 확인
                  </div>
                  <div className="text-xs text-[#6B7280] mb-3 leading-5">
                    카톡 mac 앱에서 <span className="font-semibold text-[#1A1F36]">{chat.display_name || chat.id}</span> 채팅창을
                    먼저 열고 입력란을 클릭한 상태인지 확인하세요. 잘못 발송되면 되돌릴 수 없습니다.
                  </div>
                  <div className="bg-[#F5F6F8] border border-[#D6D8DF] rounded p-2 mb-3 max-h-32 overflow-y-auto">
                    <div className="text-[10px] text-[#6B7280] mb-1">미리보기</div>
                    <div className="text-xs text-[#1A1F36] whitespace-pre-wrap break-words">
                      {replyDraft}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSendConfirmOpen(false)}
                      className="flex-1 py-1.5 text-xs rounded bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
                    >
                      취소
                    </button>
                    <button
                      onClick={confirmSend}
                      className="flex-1 py-1.5 text-xs rounded bg-orange-500 text-white hover:bg-orange-600"
                    >
                      발송
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 메모 탭 ── */}
        {tab === "메모" && (
          <div className="p-3 flex flex-col h-full">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] text-[#6B7280]">고객 메모 (자동저장)</div>
              {memoSaved && (
                <span className="text-[9px] text-green-600">저장됨</span>
              )}
            </div>
            <textarea
              value={memo}
              onChange={(e) => handleMemoChange(e.target.value)}
              placeholder={"프로젝트 요약, 고객 성향, 주의사항 등\n자유롭게 메모하세요"}
              className="flex-1 w-full min-h-[300px] text-xs text-[#1A1F36] bg-[#F5F6F8] border border-[#D6D8DF] rounded p-2 resize-none focus:outline-none focus:border-[#2959AA] placeholder-[#9CA3AF] leading-5"
            />
          </div>
        )}

        {/* ── 연동 탭 ── */}
        {tab === "연동" && (
          <div className="p-3 space-y-2">
            <div className="text-[10px] text-[#6B7280] mb-1">프로젝트 경로 연동</div>
            {projectPaths.length > 0 && (
              <ul className="space-y-1">
                {projectPaths.map((p) => {
                  const status = exportStatus[p];
                  const isExporting = exportingPath === p;
                  const isOk = status === "✓ 저장됨";
                  return (
                    <li key={p} className="bg-[#F5F6F8] border border-[#D6D8DF] rounded p-1.5">
                      <div className="flex items-center gap-1">
                        <span className="flex-1 text-[10px] text-[#1A1F36] truncate" title={p}>
                          {p.split("/").pop() || p}
                        </span>
                        <button
                          onClick={() => exportContext(p)}
                          disabled={isExporting}
                          className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 transition-colors ${
                            isOk
                              ? "bg-green-500 text-white"
                              : "bg-[#E8E9EC] hover:bg-[#D6D8DF] text-[#1A1F36] disabled:bg-[#9CA3AF]"
                          }`}
                          title="KAKAO_CONTEXT.md 저장만"
                        >
                          {isExporting ? "…" : isOk ? "저장됨" : "내보내기"}
                        </button>
                        <button
                          onClick={() => setClaudeModalPath(p)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[#2959AA] hover:bg-[#1D3F7A] text-white shrink-0 transition-colors"
                          title="컨텍스트 저장 + Claude 원격 실행"
                        >
                          Claude
                        </button>
                        <button
                          onClick={() => removePath(p)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[#E8E9EC] hover:bg-red-100 hover:text-red-600 text-[#6B7280] shrink-0 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                      <div className="text-[9px] text-[#9CA3AF] truncate mt-0.5">{p}</div>
                      {status && !isOk && (
                        <div className="text-[9px] text-red-600 mt-0.5">{status}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex gap-1">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addPath(); }}
                placeholder="/Users/me/project/my-app"
                className="flex-1 text-[10px] px-2 py-1 border border-[#D6D8DF] rounded bg-[#F5F6F8] text-[#1A1F36] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2959AA]"
              />
              <button
                onClick={addPath}
                disabled={!newPath.trim()}
                className="text-xs px-2 py-1 rounded bg-[#2959AA] hover:bg-[#1D3F7A] text-white disabled:bg-[#9CA3AF] transition-colors shrink-0"
              >
                +
              </button>
            </div>
            <div className="text-[9px] text-[#9CA3AF] mt-1">
              내보내기: KAKAO_CONTEXT.md만 저장. Claude: 컨텍스트 저장 + claude CLI 실행
            </div>
          </div>
        )}

      </div>

      {/* Claude 실행 모달 */}
      {claudeModalPath && (
        <ClaudeRunModal
          open={!!claudeModalPath}
          onClose={() => setClaudeModalPath(null)}
          chatId={chat.id}
          displayName={chat.display_name || chat.id}
          projectPath={claudeModalPath}
        />
      )}
    </div>
  );
}
