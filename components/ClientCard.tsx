"use client";

// 카드뷰 전용 클라이언트 카드
// — 분석 / 메모 / 연동 한 카드에 통합
import { useEffect, useRef, useState } from "react";
import type { Analysis, Chat, Urgency } from "@/lib/types";
import { ClaudeRunModal } from "./ClaudeRunModal";

const URGENCY_STYLE: Record<Urgency, string> = {
  Low:      "bg-[#E8E9EC] text-[#6B7280]",
  Medium:   "bg-yellow-100 text-yellow-800 border border-yellow-300",
  High:     "bg-orange-100 text-orange-800 border border-orange-300",
  Critical: "bg-red-100 text-red-700 border border-red-300",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    return sameDay
      ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
      : `${d.getMonth() + 1}/${d.getDate()}`;
  } catch { return ""; }
}

interface Props {
  chat: Chat;
  onOpenInbox: () => void;
}

export function ClientCard({ chat, onOpenInbox }: Props) {
  // 분석
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // 메모
  const [memo, setMemo] = useState("");
  const [memoSaved, setMemoSaved] = useState(false);
  const memoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 연동
  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [exportingPath, setExportingPath] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<Record<string, string>>({});
  const [claudeModalPath, setClaudeModalPath] = useState<string | null>(null);
  const [uploadingPath, setUploadingPath] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});

  // UI: 펼침 + 활성 탭
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"분석" | "메모" | "연동">("분석");

  // 초기 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [todosRes, pathRes, memoRes] = await Promise.all([
          fetch(`/api/todos?chatId=${encodeURIComponent(chat.id)}`),
          fetch(`/api/project-mapping?chatId=${encodeURIComponent(chat.id)}`),
          fetch(`/api/memo?chatId=${encodeURIComponent(chat.id)}`),
        ]);
        const todos = (await todosRes.json()) as Analysis | null;
        const pathData = (await pathRes.json()) as { paths: string[] };
        const memoData = (await memoRes.json()) as { content: string };
        if (!cancelled) {
          setAnalysis(todos || null);
          setPaths(pathData.paths ?? []);
          setMemo(memoData.content ?? "");
        }
      } catch { /* 무시 */ }
    })();
    return () => { cancelled = true; };
  }, [chat.id]);

  async function runAnalyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id }),
      });
      const data = await res.json();
      if (!res.ok) setAnalyzeError(data?.error || "분석 실패");
      else setAnalysis(data as Analysis);
    } catch (e) { setAnalyzeError(String(e)); }
    finally { setAnalyzing(false); }
  }

  function handleMemoChange(val: string) {
    setMemo(val);
    setMemoSaved(false);
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(async () => {
      await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, content: val }),
      });
      setMemoSaved(true);
      setTimeout(() => setMemoSaved(false), 1500);
    }, 1000);
  }

  async function addPath() {
    if (!newPath.trim()) return;
    const res = await fetch("/api/project-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chat.id, projectPath: newPath.trim() }),
    });
    const data = (await res.json()) as { paths: string[] };
    setPaths(data.paths ?? []);
    setNewPath("");
  }

  async function removePath(p: string) {
    const res = await fetch("/api/project-mapping", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chat.id, projectPath: p }),
    });
    const data = (await res.json()) as { paths: string[] };
    setPaths(data.paths ?? []);
  }

  async function uploadFiles(p: string, files: FileList) {
    if (!files || files.length === 0) return;
    setUploadingPath(p);
    setUploadStatus((prev) => ({ ...prev, [p]: "" }));
    try {
      const fd = new FormData();
      fd.append("chatId", chat.id);
      fd.append("projectPath", p);
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/upload-attachment", { method: "POST", body: fd });
      const data = (await res.json()) as { saved?: string[]; errors?: string[]; error?: string };
      if (!res.ok) {
        setUploadStatus((prev) => ({ ...prev, [p]: `오류: ${data.error || "실패"}` }));
      } else {
        const okCount = data.saved?.length ?? 0;
        const errCount = data.errors?.length ?? 0;
        const msg = errCount > 0
          ? `✓ ${okCount}건, 실패 ${errCount}건`
          : `✓ ${okCount}건 주입`;
        setUploadStatus((prev) => ({ ...prev, [p]: msg }));
      }
    } catch (e) {
      setUploadStatus((prev) => ({ ...prev, [p]: `오류: ${String(e)}` }));
    } finally {
      setUploadingPath(null);
    }
  }

  async function exportContext(p: string) {
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

  const name = (!chat.display_name || chat.display_name === "(unknown)")
    ? `(멤버 ${chat.member_count}명)`
    : chat.display_name;

  return (
    <div className="flex flex-col w-full bg-white border border-[#D6D8DF] rounded-lg overflow-hidden shadow-sm">
      {/* 헤더 — 클릭으로 펼침/접힘. 인박스 이동은 별도 버튼 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
        className="text-left px-3 pt-3 pb-2 cursor-pointer hover:bg-[#F5F6F8] transition-colors"
        title={expanded ? "접기" : "펼치기"}
      >
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span className="text-sm font-semibold text-[#1A1F36] leading-tight line-clamp-2 flex-1">
            {name}
          </span>
          {chat.unread_count > 0 && (
            <span className="shrink-0 text-[9px] bg-red-500 text-white rounded-full px-1.5 py-0.5 mt-0.5">
              {chat.unread_count > 99 ? "99+" : chat.unread_count}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-[#9CA3AF] shrink-0 mt-0.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-[#2959AA] text-white">고객</span>
          <span className="text-[9px] text-[#9CA3AF]">👥 {chat.member_count}</span>
          {analysis && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${URGENCY_STYLE[analysis.urgency]}`}>
              {analysis.urgency}
            </span>
          )}
          <span className="text-[9px] text-[#9CA3AF] ml-auto">{formatTime(chat.last_message_at)}</span>
        </div>
      </div>

      {expanded && (
        <>
          {/* 인박스 이동 + 탭 버튼 */}
          <div className="px-3 pb-2 pt-1 border-t border-[#E8E9EC] flex items-center gap-1">
            <button
              onClick={onOpenInbox}
              className="text-[10px] px-2 py-1 rounded bg-[#E8E9EC] hover:bg-[#D6D8DF] text-[#1A1F36] transition-colors mr-1"
              title="인박스에서 열기"
            >
              ↗ 인박스
            </button>
            <div className="flex flex-1 gap-0.5">
              {(["분석", "메모", "연동"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                    activeTab === t
                      ? "bg-[#2959AA] text-white"
                      : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 활성 탭에 따른 하단 컴포넌트 */}
          <div className="px-3 py-2 border-t border-[#E8E9EC] bg-[#FAFAFB]">
            {activeTab === "분석" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[#6B7280]">AI 분석</span>
                  <button
                    onClick={runAnalyze}
                    disabled={analyzing}
                    className="text-[10px] px-2 py-0.5 rounded bg-[#2959AA] hover:bg-[#1D3F7A] text-white disabled:bg-[#9CA3AF] transition-colors"
                  >
                    {analyzing ? "…" : analysis ? "재분석" : "분석"}
                  </button>
                </div>
                {analyzeError && (
                  <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded p-1.5">
                    {analyzeError}
                  </div>
                )}
                {analysis ? (
                  <>
                    <div className="text-[11px] text-[#1A1F36] bg-white border border-[#D6D8DF] rounded p-1.5 leading-snug">
                      {analysis.summary}
                    </div>
                    {analysis.nextAction && (
                      <div className="text-[10px] text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-1.5 leading-snug">
                        → {analysis.nextAction}
                      </div>
                    )}
                    {analysis.todos.length > 0 && (
                      <ul className="space-y-0.5">
                        {analysis.todos.map((t, i) => (
                          <li key={i} className="text-[10px] text-[#1A1F36] bg-white border border-[#D6D8DF] rounded p-1.5 leading-snug">
                            • {t}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  !analyzing && <div className="text-[10px] text-[#9CA3AF]">분석 버튼을 눌러 시작</div>
                )}
              </div>
            )}

            {activeTab === "메모" && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-[#6B7280]">메모</span>
                  {memoSaved && <span className="text-[9px] text-green-600">저장됨</span>}
                </div>
                <textarea
                  value={memo}
                  onChange={(e) => handleMemoChange(e.target.value)}
                  placeholder="고객 정보, 주의사항 등"
                  className="w-full text-[11px] text-[#1A1F36] bg-white border border-[#D6D8DF] rounded p-1.5 resize-none focus:outline-none focus:border-[#2959AA] placeholder-[#C8CAD1] leading-snug min-h-[100px]"
                  rows={5}
                />
              </div>
            )}

            {activeTab === "연동" && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium text-[#6B7280]">연동 프로젝트</span>
                {paths.length > 0 && (
                  <ul className="space-y-1">
                    {paths.map((p) => {
                      const status = exportStatus[p];
                      const isExporting = exportingPath === p;
                      const isOk = status === "✓ 저장됨";
                      return (
                        <li key={p} className="bg-white border border-[#D6D8DF] rounded p-1.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="flex-1 min-w-0 text-[10px] text-[#1A1F36] truncate" title={p}>
                              {p.split("/").pop() || p}
                            </span>
                            <button
                              onClick={() => exportContext(p)}
                              disabled={isExporting}
                              className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 transition-colors ${
                                isOk
                                  ? "bg-green-500 text-white"
                                  : "bg-[#E8E9EC] hover:bg-[#D6D8DF] text-[#1A1F36] disabled:bg-[#9CA3AF]"
                              }`}
                              title="KAKAO_CONTEXT.md 저장만"
                            >
                              {isExporting ? "…" : isOk ? "저장됨" : "컨텍스트"}
                            </button>
                            <label
                              className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 transition-colors cursor-pointer ${
                                uploadingPath === p
                                  ? "bg-[#9CA3AF] text-white"
                                  : "bg-[#E8E9EC] hover:bg-[#D6D8DF] text-[#1A1F36]"
                              }`}
                              title="사진/PDF 다중 선택 → kakao_attachments/ 에 저장"
                            >
                              {uploadingPath === p ? "업로드…" : "파일+"}
                              <input
                                type="file"
                                multiple
                                accept="image/*,.pdf,.heic,.heif"
                                className="hidden"
                                disabled={uploadingPath === p}
                                onChange={(e) => {
                                  if (e.target.files) {
                                    uploadFiles(p, e.target.files);
                                    e.target.value = "";
                                  }
                                }}
                              />
                            </label>
                            <button
                              onClick={() => setClaudeModalPath(p)}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-[#2959AA] hover:bg-[#1D3F7A] text-white shrink-0 transition-colors"
                              title="컨텍스트 저장 + Claude 원격 실행"
                            >
                              Claude
                            </button>
                            <button
                              onClick={() => removePath(p)}
                              className="text-[10px] px-1 rounded text-[#9CA3AF] hover:text-red-600 shrink-0 transition-colors"
                            >
                              ×
                            </button>
                          </div>
                          {status && !isOk && (
                            <div className="text-[9px] text-red-600 mt-0.5">{status}</div>
                          )}
                          {uploadStatus[p] && (
                            <div className={`text-[9px] mt-0.5 ${uploadStatus[p].startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
                              {uploadStatus[p]}
                            </div>
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
                    placeholder="/Users/me/project/..."
                    className="flex-1 text-[10px] px-2 py-1 border border-[#D6D8DF] rounded bg-white text-[#1A1F36] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2959AA]"
                  />
                  <button
                    onClick={addPath}
                    disabled={!newPath.trim()}
                    className="text-xs px-2 py-1 rounded bg-[#2959AA] hover:bg-[#1D3F7A] text-white disabled:bg-[#9CA3AF] transition-colors shrink-0"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Claude 실행 모달 */}
      <ClaudeRunModal
        open={!!claudeModalPath}
        chatId={chat.id}
        displayName={chat.display_name || chat.id}
        projectPath={claudeModalPath || ""}
        onClose={() => setClaudeModalPath(null)}
      />
    </div>
  );
}
