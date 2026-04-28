"use client";

// 설정 모달
import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultView: "inbox" | "board";
  onDefaultViewChange: (v: "inbox" | "board") => void;
  defaultFilter: "all" | "client" | "casual";
  onDefaultFilterChange: (f: "all" | "client" | "casual") => void;
}

interface ServerSettings {
  telegram_bot_token: string;
  telegram_chat_id: string;
  telegram_enabled: string;
  worker_enabled: string;
  app_url: string;
  claude_skip_permissions: string;
  send_enabled: string;
  poll_interval_sec: string;
}

export function SettingsModal({
  open,
  onClose,
  defaultView,
  onDefaultViewChange,
  defaultFilter,
  onDefaultFilterChange,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [testing, setTesting] = useState<"" | "ok" | "fail" | "sending">("");
  const [appUrlDraft, setAppUrlDraft] = useState("");
  const [pollSecDraft, setPollSecDraft] = useState("30");
  const [tokenDraft, setTokenDraft] = useState("");
  const [chatIdDraft, setChatIdDraft] = useState("");
  const [initStatus, setInitStatus] = useState<"" | "ok" | "fail" | "sending">("");
  const [initError, setInitError] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: ServerSettings) => {
        setSettings(s);
        setAppUrlDraft(s.app_url || "");
        setPollSecDraft(s.poll_interval_sec || "30");
        setTokenDraft(s.telegram_bot_token || "");
        setChatIdDraft(s.telegram_chat_id || "");
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  async function patch(patch: Partial<ServerSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function autoDetectChatId() {
    setInitStatus("sending");
    setInitError("");
    try {
      // 토큰 먼저 저장 (없으면 init 라우트가 거부)
      if (tokenDraft.trim()) {
        await patch({ telegram_bot_token: tokenDraft.trim() });
      }
      const r = await fetch("/api/telegram/init", { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; chatId?: string; error?: string };
      if (d.ok && d.chatId) {
        setChatIdDraft(d.chatId);
        setInitStatus("ok");
      } else {
        setInitStatus("fail");
        setInitError(d.error || "감지 실패");
      }
    } catch (e) {
      setInitStatus("fail");
      setInitError(String(e));
    }
    setTimeout(() => setInitStatus(""), 3000);
  }

  async function testPush() {
    setTesting("sending");
    try {
      const r = await fetch("/api/test-push", { method: "POST" });
      const d = (await r.json()) as { ok: boolean };
      setTesting(d.ok ? "ok" : "fail");
    } catch {
      setTesting("fail");
    }
    setTimeout(() => setTesting(""), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        ref={ref}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 border border-[#D6D8DF] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[#1A1F36]">설정</h2>
          <button
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-[#1A1F36] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* 기본 뷰 */}
          <div>
            <div className="text-xs font-medium text-[#1A1F36] mb-1.5">기본 뷰</div>
            <div className="flex gap-1.5">
              {(["inbox", "board"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onDefaultViewChange(v)}
                  className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                    defaultView === v
                      ? "bg-[#2959AA] text-white"
                      : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
                  }`}
                >
                  {v === "inbox" ? "인박스" : "보드"}
                </button>
              ))}
            </div>
          </div>

          {/* 기본 필터 */}
          <div>
            <div className="text-xs font-medium text-[#1A1F36] mb-1.5">기본 필터</div>
            <div className="flex gap-1.5">
              {(["all", "client", "casual"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => onDefaultFilterChange(f)}
                  className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                    defaultFilter === f
                      ? "bg-[#2959AA] text-white"
                      : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
                  }`}
                >
                  {f === "all" ? "전체" : f === "client" ? "고객" : "잡담"}
                </button>
              ))}
            </div>
          </div>

          {/* 푸시 알림 (텔레그램) */}
          <div className="pt-3 border-t border-[#E8E9EC]">
            <div className="text-xs font-medium text-[#1A1F36] mb-2">푸시 알림 (텔레그램)</div>

            {/* 봇 토큰 */}
            <div className="mb-2">
              <div className="text-[10px] text-[#6B7280] mb-1">봇 토큰 (BotFather)</div>
              <div className="flex gap-1">
                <input
                  type="password"
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                  placeholder="123456:AAH..."
                  className="flex-1 text-[10px] font-mono px-2 py-1.5 bg-white border border-[#D6D8DF] rounded"
                />
                <button
                  onClick={() => patch({ telegram_bot_token: tokenDraft.trim() })}
                  className="text-[10px] px-2 py-1.5 rounded bg-[#2959AA] text-white hover:bg-[#1F4485]"
                >
                  저장
                </button>
              </div>
            </div>

            {/* Chat ID + 자동 감지 */}
            <div className="mb-2">
              <div className="text-[10px] text-[#6B7280] mb-1">Chat ID</div>
              <div className="flex gap-1">
                <input
                  value={chatIdDraft}
                  onChange={(e) => setChatIdDraft(e.target.value)}
                  placeholder="봇과 /start 후 자동 감지"
                  className="flex-1 text-[10px] font-mono px-2 py-1.5 bg-white border border-[#D6D8DF] rounded"
                />
                <button
                  onClick={autoDetectChatId}
                  disabled={initStatus === "sending"}
                  className={`text-[10px] px-2 py-1.5 rounded transition-colors ${
                    initStatus === "ok"
                      ? "bg-green-500 text-white"
                      : initStatus === "fail"
                        ? "bg-red-500 text-white"
                        : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
                  }`}
                >
                  {initStatus === "sending"
                    ? "..."
                    : initStatus === "ok"
                      ? "✓"
                      : initStatus === "fail"
                        ? "✗"
                        : "자동"}
                </button>
                <button
                  onClick={() => patch({ telegram_chat_id: chatIdDraft.trim() })}
                  className="text-[10px] px-2 py-1.5 rounded bg-[#2959AA] text-white hover:bg-[#1F4485]"
                >
                  저장
                </button>
              </div>
              {initError && (
                <div className="text-[10px] text-red-600 mt-1 leading-tight">{initError}</div>
              )}
              <div className="text-[10px] text-[#9CA3AF] mt-1 leading-tight">
                BotFather로 봇 생성 → 토큰 저장 → 봇과 /start → 자동 버튼
              </div>
            </div>

            {/* 워커 토글 */}
            <ToggleRow
              label="카톡 폴링 워커"
              hint="주기적으로 새 메시지 검사"
              on={settings?.worker_enabled === "1"}
              onChange={(v) => patch({ worker_enabled: v ? "1" : "0" })}
            />

            {/* 폴링 인터벌 */}
            <div className="mt-1 mb-2">
              <div className="text-[10px] text-[#6B7280] mb-1">폴링 주기 (초, 30~600)</div>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={30}
                  max={600}
                  step={10}
                  value={pollSecDraft}
                  onChange={(e) => setPollSecDraft(e.target.value)}
                  className="flex-1 text-[10px] px-2 py-1.5 bg-white border border-[#D6D8DF] rounded"
                />
                <button
                  onClick={() => {
                    const n = parseInt(pollSecDraft, 10);
                    const clamped = Math.max(30, Math.min(600, Number.isFinite(n) ? n : 30));
                    setPollSecDraft(String(clamped));
                    void patch({ poll_interval_sec: String(clamped) });
                  }}
                  className="text-[10px] px-2 py-1.5 rounded bg-[#2959AA] text-white hover:bg-[#1F4485]"
                >
                  저장
                </button>
              </div>
              <div className="text-[10px] text-[#9CA3AF] mt-1 leading-tight">
                짧을수록 반응 빠름. kakaocli 부하 고려해 60~120초 권장
              </div>
            </div>

            {/* 알림 토글 */}
            <ToggleRow
              label="텔레그램 푸시 전송"
              hint="새 메시지 발견 시 봇으로 푸시"
              on={settings?.telegram_enabled === "1"}
              onChange={(v) => patch({ telegram_enabled: v ? "1" : "0" })}
            />

            {/* 앱 URL (인박스 열기 버튼 딥링크) */}
            <div className="mt-2">
              <div className="text-[10px] text-[#6B7280] mb-1">앱 URL (텔레그램 인박스 열기 버튼)</div>
              <div className="flex gap-1">
                <input
                  type="url"
                  value={appUrlDraft}
                  onChange={(e) => setAppUrlDraft(e.target.value)}
                  placeholder="http://100.x.x.x:3032"
                  className="flex-1 text-[10px] px-2 py-1.5 bg-white border border-[#D6D8DF] rounded"
                />
                <button
                  onClick={() => patch({ app_url: appUrlDraft.trim() })}
                  className="text-[10px] px-2 py-1.5 rounded bg-[#2959AA] text-white hover:bg-[#1F4485]"
                >
                  저장
                </button>
              </div>
              <div className="text-[10px] text-[#9CA3AF] mt-1 leading-tight">
                Tailscale 100.x IP 권장. 비워두면 localhost
              </div>
            </div>

            {/* Claude 권한 스킵 */}
            <div className="mt-2 pt-2 border-t border-[#E8E9EC]">
              <ToggleRow
                label="Claude 권한 스킵 (위험)"
                hint="--dangerously-skip-permissions로 실행. 원격 자동화에 필요"
                on={settings?.claude_skip_permissions === "1"}
                onChange={(v) => patch({ claude_skip_permissions: v ? "1" : "0" })}
              />
              <ToggleRow
                label="카톡 자동발송 (매우 위험)"
                hint="발송 직전 카톡 채팅창 열고 입력란 포커스 필수"
                on={settings?.send_enabled === "1"}
                onChange={(v) => patch({ send_enabled: v ? "1" : "0" })}
              />
              {settings?.send_enabled === "1" && (
                <div className="text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded p-2 mt-1 leading-tight">
                  활성화됨. AppleScript가 클립보드 paste + Enter. 잘못 발송되면 되돌릴 수 없음.
                  System Events 접근권한 필요 (시스템설정 → 개인정보보호 → 손쉬운 사용)
                </div>
              )}
            </div>

            {/* 테스트 푸시 */}
            <button
              onClick={testPush}
              disabled={testing === "sending"}
              className={`mt-3 w-full py-1.5 text-xs rounded transition-colors ${
                testing === "ok"
                  ? "bg-green-500 text-white"
                  : testing === "fail"
                    ? "bg-red-500 text-white"
                    : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
              }`}
            >
              {testing === "sending"
                ? "전송 중..."
                : testing === "ok"
                  ? "✓ 전송 완료"
                  : testing === "fail"
                    ? "✗ 실패"
                    : "테스트 푸시 보내기"}
            </button>
          </div>

          {/* 앱 정보 */}
          <div className="pt-3 border-t border-[#E8E9EC]">
            <div className="text-[10px] text-[#9CA3AF] space-y-0.5">
              <div>카카오 인박스 GUI v0.1</div>
              <div>DB: ~/.kakaocli/kakao-gui.db</div>
              <div>포트: 3032</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="min-w-0 flex-1 mr-2">
        <div className="text-xs text-[#1A1F36]">{label}</div>
        <div className="text-[10px] text-[#9CA3AF] leading-tight">{hint}</div>
      </div>
      <button
        onClick={() => onChange(!on)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
          on ? "bg-[#2959AA]" : "bg-[#D6D8DF]"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
            on ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );
}
