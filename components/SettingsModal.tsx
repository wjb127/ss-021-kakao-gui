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
  ntfy_topic: string;
  ntfy_enabled: string;
  worker_enabled: string;
  app_url: string;
  claude_skip_permissions: string;
  send_enabled: string;
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
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState<"" | "ok" | "fail" | "sending">("");
  const [appUrlDraft, setAppUrlDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: ServerSettings) => {
        setSettings(s);
        setAppUrlDraft(s.app_url || "");
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

  async function copyTopic() {
    if (!settings?.ntfy_topic) return;
    await navigator.clipboard.writeText(settings.ntfy_topic);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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

          {/* 푸시 알림 (ntfy) */}
          <div className="pt-3 border-t border-[#E8E9EC]">
            <div className="text-xs font-medium text-[#1A1F36] mb-2">푸시 알림 (ntfy.sh)</div>

            {/* 토픽 */}
            <div className="mb-2">
              <div className="text-[10px] text-[#6B7280] mb-1">토픽 (모바일 앱에서 구독)</div>
              <div className="flex gap-1">
                <input
                  readOnly
                  value={settings?.ntfy_topic || "..."}
                  className="flex-1 text-[10px] font-mono px-2 py-1.5 bg-[#F5F6F8] border border-[#D6D8DF] rounded"
                />
                <button
                  onClick={copyTopic}
                  className={`text-[10px] px-2 py-1.5 rounded transition-colors ${
                    copied
                      ? "bg-green-500 text-white"
                      : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
                  }`}
                >
                  {copied ? "✓" : "복사"}
                </button>
              </div>
              <div className="text-[10px] text-[#9CA3AF] mt-1 leading-tight">
                ntfy 앱 설치 → 토픽 구독 → 카톡 새 메시지 시 푸시 수신
              </div>
            </div>

            {/* 워커 토글 */}
            <ToggleRow
              label="카톡 폴링 워커"
              hint="30초마다 새 메시지 검사"
              on={settings?.worker_enabled === "1"}
              onChange={(v) => patch({ worker_enabled: v ? "1" : "0" })}
            />

            {/* 알림 토글 */}
            <ToggleRow
              label="ntfy 푸시 전송"
              hint="새 메시지 발견 시 토픽으로 푸시"
              on={settings?.ntfy_enabled === "1"}
              onChange={(v) => patch({ ntfy_enabled: v ? "1" : "0" })}
            />

            {/* 앱 URL (푸시 클릭 딥링크) */}
            <div className="mt-2">
              <div className="text-[10px] text-[#6B7280] mb-1">앱 URL (푸시 클릭 딥링크)</div>
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
