"use client";

import { CheckCircle2, ExternalLink, KeyRound, Loader2, X, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { useSession } from "@/components/SessionContext";
import { buttonClass, fieldClass, when } from "./account/shared";

type Provider = "gemini" | "groq" | "openrouter" | "cloudflare" | "tavily";
type KeyProvider = "gemini" | "groq" | "openrouter" | "tavily";
/** 키 입력 칸 — 업체 + Gemini 예비 키 */
type KeySlot = KeyProvider | "geminiBackup";
type SettingName = "GEMINI_API_KEY" | "GEMINI_BACKUP_API_KEY" | "GROQ_API_KEY" | "OPENROUTER_API_KEY" | "TAVILY_API_KEY" | "GEMINI_MODEL" | "AI_PROVIDERS";
type KeyName = "GEMINI_API_KEY" | "GEMINI_BACKUP_API_KEY" | "GROQ_API_KEY" | "OPENROUTER_API_KEY" | "TAVILY_API_KEY";

interface SettingView {
  app: boolean;
  appValue: string | null;
  env: boolean;
  envValue: string | null;
  broken: boolean;
  source: "app" | "cloudflare" | null;
}
interface ProviderState {
  coolingDown: boolean;
  coolUntil: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}
interface View {
  available: boolean;
  updatedAt: string;
  updatedBy: string;
  effectiveModel: string;
  settings: Record<SettingName, SettingView>;
  status: {
    order: Provider[];
    gemini: ProviderState & { key: boolean; backupKey?: boolean };
    groq: ProviderState & { key: boolean; model: string; searchModel: string };
    openrouter?: ProviderState & { key: boolean; model: string };
    cloudflare: ProviderState & { binding: boolean; model: string };
    tavily?: { key: boolean };
  };
}
interface TestResult {
  ok: boolean;
  ms: number;
  message: string;
  model: string;
}

const MODELS = [
  { id: "gemini-flash-lite-latest", label: "Flash-Lite 최신 (권장 · 무료 한도가 가장 넉넉함)" },
  { id: "gemini-flash-latest", label: "Flash 최신 (품질 ↑ · 무료 한도 적음)" },
];
const ORDERS = [
  { id: "gemini,groq,openrouter,cloudflare", label: "Gemini → Groq → OpenRouter → Cloudflare AI (권장)" },
  { id: "groq,gemini,openrouter,cloudflare", label: "Groq → Gemini → OpenRouter → Cloudflare AI" },
  { id: "groq,openrouter,cloudflare,gemini", label: "무료 먼저: Groq → OpenRouter → Cloudflare → Gemini" },
  { id: "gemini,cloudflare", label: "Gemini → Cloudflare AI" },
  { id: "gemini", label: "Gemini만" },
];
const LABEL: Record<Provider, string> = { gemini: "Gemini", groq: "Groq", openrouter: "OpenRouter", cloudflare: "Cloudflare AI", tavily: "Tavily 검색" };
const SLOT_LABEL: Record<KeySlot, string> = { ...LABEL, geminiBackup: "Gemini 예비" };
const EMPTY_DRAFT: Record<KeySlot, string> = { gemini: "", geminiBackup: "", groq: "", openrouter: "", tavily: "" };

async function call<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/ai-settings", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !data) throw new Error(data?.error?.message ?? `요청에 실패했습니다. (${res.status})`);
  return data;
}

function Source({ s }: { s: SettingView }) {
  if (s.broken && !s.app)
    return <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">저장된 키를 풀 수 없음 — 다시 입력해 주세요</span>;
  if (s.source === "app") return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">앱에 저장됨 {s.appValue}</span>;
  if (s.source === "cloudflare") return <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">Cloudflare 설정 사용 중 {s.envValue}</span>;
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">없음</span>;
}

function StateLine({ st }: { st: ProviderState }) {
  if (st.coolingDown)
    return (
      <p className="text-[10.5px] text-amber-700">
        최근 오류로 {when(st.coolUntil ?? "")}까지 건너뜀 — {st.lastError}
      </p>
    );
  if (st.lastError)
    return (
      <p className="text-[10.5px] text-slate-500">
        마지막 오류 {when(st.lastErrorAt ?? "")}: {st.lastError}
      </p>
    );
  return null;
}

/** 더보기 → [AI 키 설정] (관리자만) — Gemini·Groq 키, Gemini 모델, 사용 순서, 연결 시험 */
export function AiKeySettings() {
  const session = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<Record<KeySlot, string>>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [tests, setTests] = useState<Partial<Record<Provider, TestResult>>>({});

  if (!session.isAdmin) return null;

  const load = async () => {
    try {
      setView(await call<View>("GET"));
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "불러오지 못했습니다." });
    }
  };
  const open = () => {
    setMessage(null);
    setTests({});
    setDraft(EMPTY_DRAFT);
    dialogRef.current?.showModal();
    void load();
  };

  const save = async (patch: Partial<Record<SettingName, string | null>>, done: string) => {
    setBusy("save");
    setMessage(null);
    try {
      setView(await call<View>("PUT", patch));
      setMessage({ kind: "ok", text: done });
      setDraft(EMPTY_DRAFT);
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "저장하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  };

  const test = async (p: Provider) => {
    setBusy(`test-${p}`);
    try {
      const r = await call<TestResult>("POST", { action: "test", provider: p });
      setTests((t) => ({ ...t, [p]: r }));
      void load();
    } catch (e) {
      setTests((t) => ({ ...t, [p]: { ok: false, ms: 0, message: e instanceof Error ? e.message : "시험하지 못했습니다.", model: "" } }));
    } finally {
      setBusy(null);
    }
  };

  const testButton = (p: Provider) => (
    <button type="button" onClick={() => void test(p)} disabled={busy !== null} className={`${buttonClass} disabled:opacity-50`}>
      {busy === `test-${p}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      연결 시험
    </button>
  );
  const testLine = (p: Provider) => {
    const r = tests[p];
    if (!r) return null;
    return (
      <p role="status" className={`flex items-start gap-1 text-[11px] ${r.ok ? "text-emerald-700" : "text-rose-700"}`}>
        {r.ok ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> : <XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />}
        <span>
          {LABEL[p]} {r.ok ? "연결됨" : "실패"}
          {r.model ? ` · ${r.model}` : ""}
          {r.ms ? ` · ${(r.ms / 1000).toFixed(1)}초` : ""}
          {!r.ok ? ` — ${r.message}` : ""}
        </span>
      </p>
    );
  };

  const keyBlock = (p: KeySlot, name: KeyName, link: string, linkText: string) => {
    const s = view?.settings[name];
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${SLOT_LABEL[p]} API 키`}
          placeholder={s?.source ? "새 키로 바꾸려면 입력" : "API 키 붙여넣기"}
          value={draft[p]}
          disabled={!view?.available}
          onChange={(e) => setDraft((d) => ({ ...d, [p]: e.target.value }))}
          className={`${fieldClass} min-w-0 flex-1 font-mono`}
        />
        <button
          type="button"
          disabled={busy !== null || !draft[p].trim() || !view?.available}
          onClick={() => void save({ [name]: draft[p] }, `${SLOT_LABEL[p]} 키를 저장했습니다. [연결 시험]으로 확인해 보세요.`)}
          className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
        >
          저장
        </button>
        {s?.app && (
          <button type="button" disabled={busy !== null} onClick={() => void save({ [name]: null }, `앱에 저장한 ${SLOT_LABEL[p]} 키를 지웠습니다.`)} className={buttonClass}>
            지우기
          </button>
        )}
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-indigo-600 hover:underline">
          {linkText}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    );
  };

  const modelSetting = view?.settings.GEMINI_MODEL;
  const orderNow = view?.status.order.join(",") ?? "gemini,groq,openrouter,cloudflare";

  return (
    <>
      <button type="button" onClick={open} className={buttonClass} aria-haspopup="dialog">
        <KeyRound className="h-3.5 w-3.5" aria-hidden />
        <span>AI 키 설정</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="ai-settings-title"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 id="ai-settings-title" className="text-sm font-semibold text-slate-900">
              AI 키 설정
            </h2>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="space-y-4 overflow-y-auto p-4 text-xs text-slate-700">
            <p className="text-[11px] leading-4 text-slate-500">
              Gemini가 한도·크레딧 소진·붐빔으로 안 되면 아래 순서대로 다른 AI가 이어 받습니다. 여기서 넣은 키는 암호화해 서버에 보관하고 다시 보여 주지 않습니다(끝 4자리만).
              앱에서 넣은 값이 Cloudflare 설정보다 우선하고, 지우면 Cloudflare 설정을 씁니다.
            </p>

            {message && (
              <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-md px-2.5 py-2 text-[11px] ${message.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
                {message.text}
              </p>
            )}

            {!view ? (
              <p className="flex items-center gap-1.5 text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> 불러오는 중…
              </p>
            ) : (
              <>
                {!view.available && (
                  <p className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                    서버 저장소(KV)나 접속 코드가 없어 앱에서 키를 저장할 수 없습니다. 지금은 Cloudflare 설정 값만 씁니다(연결 시험은 할 수 있습니다).
                  </p>
                )}

                <section aria-label="Gemini" className="space-y-1.5 rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-slate-900">① Gemini (기본)</h3>
                    <div className="flex items-center gap-1.5">
                      <Source s={view.settings.GEMINI_API_KEY} />
                      {testButton("gemini")}
                    </div>
                  </div>
                  {keyBlock("gemini", "GEMINI_API_KEY", "https://aistudio.google.com/apikey", "무료 키 받기")}
                  <p className="text-[10.5px] leading-4 text-slate-500">무료 키는 결제를 연결하지 않은 AI Studio 프로젝트에서 만듭니다(선불 크레딧 프로젝트의 키는 크레딧이 떨어지면 멈춥니다).</p>
                  <div className="space-y-1 rounded-md bg-slate-50 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-700">예비 키 (선택)</span>
                      <Source s={view.settings.GEMINI_BACKUP_API_KEY} />
                    </div>
                    {keyBlock("geminiBackup", "GEMINI_BACKUP_API_KEY", "https://aistudio.google.com/apikey", "키 만들기")}
                    <p className="text-[10.5px] leading-4 text-slate-500">
                      주 키가 크레딧 소진·사용량 한도·키 오류로 막히면 같은 요청을 예비 키로 다시 보냅니다(막힌 키는 한도 1분, 크레딧·키 오류 1시간 쉼). 예: 평소엔 무료 키, 한도가 차면
                      결제를 연결한 키. 무료 한도를 늘리려고 무료 키를 여러 개 돌려 쓰는 것은 Google 약관(사용량 제한 우회 금지)에 걸릴 수 있어 권하지 않습니다.
                    </p>
                  </div>
                  <label className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-600">모델</span>
                    <select
                      aria-label="Gemini 모델"
                      value={MODELS.some((m) => m.id === view.effectiveModel) ? view.effectiveModel : "__custom"}
                      disabled={busy !== null || !view.available}
                      onChange={(e) => {
                        if (e.target.value !== "__custom") void save({ GEMINI_MODEL: e.target.value }, `Gemini 모델을 ${e.target.value}(으)로 바꿨습니다.`);
                      }}
                      className={fieldClass}
                    >
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                      {!MODELS.some((m) => m.id === view.effectiveModel) && <option value="__custom">{view.effectiveModel} (Cloudflare 설정)</option>}
                    </select>
                    {modelSetting?.app && (
                      <button type="button" disabled={busy !== null} onClick={() => void save({ GEMINI_MODEL: null }, "모델을 기본값으로 되돌렸습니다.")} className="text-[11px] text-slate-500 underline">
                        기본값으로
                      </button>
                    )}
                  </label>
                  <StateLine st={view.status.gemini} />
                  {testLine("gemini")}
                </section>

                <section aria-label="Groq" className="space-y-1.5 rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-slate-900">② Groq (대체)</h3>
                    <div className="flex items-center gap-1.5">
                      <Source s={view.settings.GROQ_API_KEY} />
                      {testButton("groq")}
                    </div>
                  </div>
                  {keyBlock("groq", "GROQ_API_KEY", "https://console.groq.com/keys", "무료 키 받기")}
                  <p className="text-[10.5px] leading-4 text-slate-500">
                    일반 작업 {view.status.groq.model}, 웹 검색 조사 {view.status.groq.searchModel}. 코스표 PDF는 읽지 못합니다(사진은 읽음).
                  </p>
                  <StateLine st={view.status.groq} />
                  {testLine("groq")}
                </section>

                <section aria-label="OpenRouter" className="space-y-1.5 rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-slate-900">③ OpenRouter 무료 모델 (대체)</h3>
                    <div className="flex items-center gap-1.5">
                      <Source s={view.settings.OPENROUTER_API_KEY} />
                      {testButton("openrouter")}
                    </div>
                  </div>
                  {keyBlock("openrouter", "OPENROUTER_API_KEY", "https://openrouter.ai/settings/keys", "무료 키 받기")}
                  <p className="text-[10.5px] leading-4 text-slate-500">
                    무료(:free) 모델 중 쓸 수 있는 것을 자동으로 고릅니다{view.status.openrouter?.model ? ` (지금 ${view.status.openrouter.model})` : ""}. 무료는 하루 50회, $10 한 번 충전하면 하루 1,000회.
                  </p>
                  {view.status.openrouter && <StateLine st={view.status.openrouter} />}
                  {testLine("openrouter")}
                </section>

                <section aria-label="Cloudflare AI" className="space-y-1.5 rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-slate-900">④ Cloudflare AI (마지막 대체)</h3>
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${view.status.cloudflare.binding ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {view.status.cloudflare.binding ? "연결됨 (키 불필요)" : "연결 없음"}
                      </span>
                      {testButton("cloudflare")}
                    </div>
                  </div>
                  <p className="text-[10.5px] leading-4 text-slate-500">
                    {view.status.cloudflare.model} · 하루 무료 사용량 안에서만 동작하고, 웹 검색을 하지 않아 요금·운영 정보는 추정으로 표시됩니다.
                  </p>
                  <StateLine st={view.status.cloudflare} />
                  {testLine("cloudflare")}
                </section>

                <section aria-label="Tavily 검색" className="space-y-1.5 rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-slate-900">웹 검색 (Tavily) — Gemini 없이 시세·입장료 조사</h3>
                    <div className="flex items-center gap-1.5">
                      <Source s={view.settings.TAVILY_API_KEY} />
                      {testButton("tavily")}
                    </div>
                  </div>
                  {keyBlock("tavily", "TAVILY_API_KEY", "https://app.tavily.com/home", "무료 키 받기")}
                  <p className="text-[10.5px] leading-4 text-slate-500">
                    Gemini를 못 쓸 때 Groq·OpenRouter·Cloudflare가 이 검색 결과를 근거로 조사합니다(출처 표시). 없으면 대체 AI는 &quot;웹 근거 없음(추정)&quot;으로 답합니다. 무료 월 사용량이 있습니다.
                  </p>
                  {testLine("tavily")}
                </section>

                <section aria-label="사용 순서" className="space-y-1.5">
                  <label className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-900">사용 순서</span>
                    <select
                      aria-label="AI 사용 순서"
                      value={ORDERS.some((o) => o.id === orderNow) ? orderNow : "__custom"}
                      disabled={busy !== null || !view.available}
                      onChange={(e) => {
                        if (e.target.value !== "__custom") void save({ AI_PROVIDERS: e.target.value }, "사용 순서를 바꿨습니다.");
                      }}
                      className={fieldClass}
                    >
                      {ORDERS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                      {!ORDERS.some((o) => o.id === orderNow) && <option value="__custom">{view.status.order.map((p) => LABEL[p]).join(" → ")}</option>}
                    </select>
                  </label>
                </section>

                {view.updatedAt && (
                  <p className="text-[10.5px] text-slate-400">
                    마지막 변경 {when(view.updatedAt)} · {view.updatedBy}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
