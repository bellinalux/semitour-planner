/**
 * AI 대체 업체 — Gemini가 한도·크레딧 소진·장애로 안 될 때 이어 받는다.
 *  - 순서: 환경변수 AI_PROVIDERS (기본 "gemini,groq,cloudflare"). 키·연결이 없는 업체는 건너뛴다.
 *  - 한 번 한도에 걸린 업체는 잠시(쿨다운) 부르지 않는다 — 매번 실패를 기다리지 않게.
 *  - Groq: OpenAI 호환 API(GROQ_API_KEY). 계정에서 쓸 수 있는 모델을 조회해 고른다. 검색은 compound 모델(있으면).
 *  - OpenRouter: 무료(:free) 모델 (OPENROUTER_API_KEY).
 *  - Tavily: 웹 검색 API (TAVILY_API_KEY) — Gemini·Groq 검색이 없을 때 조사의 웹 근거.
 *  - Cloudflare Workers AI: Worker 바인딩(AI) — 키가 필요 없다. 웹 검색은 없다.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { workerEnv } from "./cfEnv";
import { aiSetting } from "./aiSettings";

export type ProviderId = "gemini" | "groq" | "openrouter" | "cloudflare";
export const PROVIDER_LABEL: Record<ProviderId, string> = { gemini: "Gemini", groq: "Groq", openrouter: "OpenRouter", cloudflare: "Cloudflare AI" };
const ALL_PROVIDERS: ProviderId[] = ["gemini", "groq", "openrouter", "cloudflare"];

export function providerOrder(): ProviderId[] {
  const raw = (aiSetting("AI_PROVIDERS") ?? "gemini,groq,openrouter,cloudflare").split(",").map((s) => s.trim().toLowerCase());
  const valid = raw.filter((p): p is ProviderId => (ALL_PROVIDERS as string[]).includes(p));
  const unique = [...new Set(valid)];
  // 예전에 저장한 순서(openrouter 없음)에도 키를 넣으면 쓰이도록 Cloudflare 앞에 끼운다
  if (unique.length && !unique.includes("openrouter")) {
    const cf = unique.indexOf("cloudflare");
    unique.splice(cf >= 0 ? cf : unique.length, 0, "openrouter");
  }
  return unique.length ? unique : ALL_PROVIDERS;
}

// ── 쿨다운 (이 서버 인스턴스 안) ─────────────────────────────

interface ProviderState {
  coolUntil: number;
  lastError: string;
  lastErrorAt: string;
}

function states(): Map<ProviderId, ProviderState> {
  const g = globalThis as unknown as { __semitourAiStates?: Map<ProviderId, ProviderState> };
  return (g.__semitourAiStates ??= new Map());
}

export function coolingDown(p: ProviderId, now = Date.now()): boolean {
  return (states().get(p)?.coolUntil ?? 0) > now;
}

/** 실패 종류별 쉬는 시간 — 크레딧·키 문제는 금방 안 풀리므로 길게 */
export function cooldownMs(status: number, message: string): number {
  if (status === 402 || /credit|billing|prepay/i.test(message)) return 60 * 60_000;
  if (status === 401 || status === 403 || status === 0) return 60 * 60_000; // 키 없음·잘못됨·지역 제한
  if (status === 429) {
    const m = message.match(/retry in ([\d.]+)s/i) ?? message.match(/try again in ([\d.]+)s/i);
    const sec = m ? Number(m[1]) : NaN;
    return Number.isFinite(sec) ? Math.min(Math.max(sec * 1000, 30_000), 30 * 60_000) : 5 * 60_000;
  }
  return 60_000; // 5xx·시간 초과
}

export function markFailure(p: ProviderId, status: number, message: string): void {
  states().set(p, {
    coolUntil: Date.now() + cooldownMs(status, message),
    lastError: `${status || "-"} ${message}`.slice(0, 200),
    lastErrorAt: new Date().toISOString(),
  });
}

export function resetProviderStates(): void {
  states().clear();
}

/** 관리자 상태 화면용 */
export async function providerStatus() {
  const now = Date.now();
  const view = (p: ProviderId) => {
    const s = states().get(p);
    return { coolingDown: (s?.coolUntil ?? 0) > now, coolUntil: s && s.coolUntil > now ? new Date(s.coolUntil).toISOString() : null, lastError: s?.lastError ?? null, lastErrorAt: s?.lastErrorAt ?? null };
  };
  return {
    order: providerOrder(),
    gemini: { key: !!aiSetting("GEMINI_API_KEY"), backupKey: !!aiSetting("GEMINI_BACKUP_API_KEY"), ...view("gemini") },
    groq: { key: !!groqKey(), model: (groqKey() ? await groqPick("general") : null) ?? groqModel(), searchModel: groqKey() ? ((await groqPick("search")) ?? "없음 — Tavily 또는 웹 근거 없이") : groqSearchModel(), ...view("groq") },
    openrouter: { key: !!openRouterKey(), model: (openRouterKey() ? await openRouterPick() : null) ?? openRouterModel(), ...view("openrouter") },
    cloudflare: { binding: (await cfAi()) !== null, model: cfModel(), ...view("cloudflare") },
    tavily: { key: !!tavilyKey() },
  };
}

// ── 이번 요청에서 어느 업체가 답했는지 (응답 머리글 X-AI-Provider로 화면에 알린다) ──

interface AiUsage {
  used: ProviderId[];
  reasons: string[];
}
const usageStore = new AsyncLocalStorage<AiUsage>();

export function noteProviderUsed(p: ProviderId, reason?: string): void {
  const u = usageStore.getStore();
  if (!u) return;
  if (!u.used.includes(p)) u.used.push(p);
  if (reason && !u.reasons.includes(reason)) u.reasons.push(reason);
}

/**
 * AI를 부르는 API 처리 함수를 감싼다. 대체 업체가 답했으면 응답에
 *  X-AI-Provider: groq (쉼표로 여럿), X-AI-Fallback: 이유(URL 인코딩) 를 붙인다.
 */
export function withAiInfo<A extends unknown[]>(handler: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return (...args: A) => {
    const usage: AiUsage = { used: [], reasons: [] };
    return usageStore.run(usage, async () => {
      const res = await handler(...args);
      const fallback = usage.used.filter((p) => p !== "gemini");
      if (fallback.length === 0) return res;
      const headers = new Headers(res.headers);
      headers.set("X-AI-Provider", fallback.join(","));
      if (usage.reasons.length) headers.set("X-AI-Fallback", encodeURIComponent(usage.reasons.join(" / ").slice(0, 300)));
      headers.append("Access-Control-Expose-Headers", "X-AI-Provider, X-AI-Fallback");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    });
  };
}

// ── 공통 대화 형식 (OpenAI 호환) ───────────────────────────

export type ChatContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}
export type ChatResult =
  | { ok: true; text: string; truncated: boolean; sources: { title: string; url: string }[]; searched: boolean }
  | { ok: false; status: number; message: string };

interface ChatOptions {
  messages: ChatMessage[];
  /** JSON 스키마를 주면 구조화 출력(지원하지 않으면 JSON 모드)으로 요청 */
  jsonSchema?: Record<string, unknown>;
  temperature: number;
  timeoutMs: number;
  /** 웹 검색 조사 (Groq compound) */
  search?: boolean;
  /** 이미지가 들어 있다 */
  vision?: boolean;
}

// ── 공통: OpenAI 호환 API (Groq·OpenRouter) ─────────────────────

interface OpenAiResponse {
  choices?: {
    message?: {
      content?: string | null;
      executed_tools?: { type?: string; search_results?: { results?: { title?: string; url?: string }[] } }[];
    };
    finish_reason?: string;
  }[];
  error?: { message?: string; code?: string | number };
}

async function openAiOnce(
  label: string,
  url: string,
  headers: Record<string, string>,
  model: string,
  o: ChatOptions,
  format: "schema" | "object" | "none",
  maxTokens = 16384,
): Promise<ChatResult> {
  const body: Record<string, unknown> = { model, messages: o.messages, temperature: o.temperature, max_tokens: maxTokens };
  if (format === "schema" && o.jsonSchema) body.response_format = { type: "json_schema", json_schema: { name: "result", schema: o.jsonSchema, strict: false } };
  else if (format === "object") body.response_format = { type: "json_object" };
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(o.timeoutMs) });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, status: timeout ? 504 : 502, message: timeout ? `${label} 응답 시간 초과` : `${label} 연결 실패` };
  }
  const data = (await res.json().catch(() => ({}))) as OpenAiResponse;
  if (!res.ok) return { ok: false, status: res.status, message: data.error?.message ?? res.statusText };
  const choice = data.choices?.[0];
  const tools = choice?.message?.executed_tools ?? [];
  const seen = new Set<string>();
  const sources = tools
    .flatMap((t) => t.search_results?.results ?? [])
    .filter((r): r is { title?: string; url: string } => typeof r.url === "string" && !seen.has(r.url) && !!seen.add(r.url))
    .map((r) => ({ title: r.title?.trim() || r.url, url: r.url }))
    .slice(0, 12);
  return {
    ok: true,
    text: choice?.message?.content ?? "",
    truncated: choice?.finish_reason === "length",
    sources,
    searched: sources.length > 0 || tools.some((t) => /search/i.test(t.type ?? "")),
  };
}

/** 구조화 출력이 거절되면(400) JSON 모드로, 그것도 거절되면 형식 지정 없이 한 번 더 */
async function withFormats(o: ChatOptions, call: (f: "schema" | "object" | "none") => Promise<ChatResult>): Promise<ChatResult> {
  const formats: ("schema" | "object" | "none")[] = o.search ? ["none"] : o.jsonSchema ? (o.vision ? ["object", "none"] : ["schema", "object", "none"]) : ["none"];
  let last: ChatResult = { ok: false, status: 0, message: "호출 안 함" };
  for (const f of formats) {
    last = await call(f);
    if (last.ok || last.status !== 400 || /model/i.test(last.message) && /not exist|not found|decommission/i.test(last.message)) return last;
  }
  return last;
}

const modelMissing = (r: ChatResult) => !r.ok && (r.status === 404 || /model[^.]*(does not exist|not found|decommission|no longer)/i.test(r.message));

// ── Groq — 계정에서 쓸 수 있는 모델을 조회해 고른다 (무료 등급 모델이 자주 바뀐다) ──

const GROQ_URL = "https://api.groq.com/openai/v1";
/** 앱 "AI 키 설정"에 넣은 값 > Cloudflare 변수 */
export const groqKey = () => aiSetting("GROQ_API_KEY");
const GROQ_PREFS = {
  general: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "moonshotai/kimi-k2-instruct-0905", "moonshotai/kimi-k2-instruct", "qwen/qwen3-32b", "llama-3.3-70b-versatile", "meta-llama/llama-4-maverick-17b-128e-instruct", "meta-llama/llama-4-scout-17b-16e-instruct"],
  search: ["groq/compound", "groq/compound-mini", "compound-beta", "compound-beta-mini"],
  vision: ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"],
};
const GROQ_ENV = { general: "GROQ_MODEL", search: "GROQ_SEARCH_MODEL", vision: "GROQ_VISION_MODEL" } as const;
type ModelKind = keyof typeof GROQ_PREFS;

interface ModelCache {
  at: number;
  ids: Set<string> | null;
}
function modelCache(name: string): { current: ModelCache } {
  const g = globalThis as unknown as { __semitourModels?: Map<string, { current: ModelCache }> };
  const m = (g.__semitourModels ??= new Map());
  if (!m.has(name)) m.set(name, { current: { at: 0, ids: null } });
  return m.get(name)!;
}
export function resetModelCaches(): void {
  const g = globalThis as unknown as { __semitourModels?: Map<string, { current: ModelCache }> };
  g.__semitourModels?.clear();
}

async function groqModels(): Promise<Set<string> | null> {
  const c = modelCache("groq");
  if (Date.now() - c.current.at < 60 * 60_000) return c.current.ids;
  const key = groqKey();
  let ids: Set<string> | null = null;
  if (key) {
    try {
      const res = await fetch(`${GROQ_URL}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
      if (res.ok) ids = new Set(((await res.json()) as { data?: { id: string; active?: boolean }[] }).data?.filter((m) => m.active !== false).map((m) => m.id) ?? []);
    } catch {
      ids = null;
    }
  }
  c.current = { at: Date.now(), ids };
  return ids;
}

/** 쓸 모델 — 환경변수 > 선호 순서 중 계정에 있는 것. 목록을 못 받으면 선호 첫 번째. 검색·사진 모델이 없으면 null */
export async function groqPick(kind: ModelKind): Promise<string | null> {
  const env = process.env[GROQ_ENV[kind]]?.trim();
  const prefs = [...(env ? [env] : []), ...GROQ_PREFS[kind]];
  const ids = await groqModels();
  if (!ids) return prefs[0];
  const hit = prefs.find((id) => ids.has(id));
  if (hit) return hit;
  if (kind !== "general") return null;
  return [...ids].find((id) => !/whisper|guard|tts|playai|distil|orpheus|compound/i.test(id)) ?? null;
}
export const groqModel = () => process.env.GROQ_MODEL?.trim() || GROQ_PREFS.general[0];
export const groqSearchModel = () => process.env.GROQ_SEARCH_MODEL?.trim() || GROQ_PREFS.search[0];
export const groqVisionModel = () => process.env.GROQ_VISION_MODEL?.trim() || GROQ_PREFS.vision[0];
/** 이 계정에 웹 검색 모델(compound)이 있는가 */
export const groqHasSearch = async () => (await groqPick("search")) !== null;

/**
 * Groq 호출. 검색 모델이 없으면(무료 등급에서 빠짐) 일반 모델로 답한다(searched=false).
 * 모델이 없다는 404가 나면 목록을 새로 받아 한 번 더.
 */
export async function groqChat(o: ChatOptions): Promise<ChatResult> {
  const key = groqKey();
  if (!key) return { ok: false, status: 0, message: "GROQ_API_KEY 없음" };
  for (let attempt = 0; attempt < 2; attempt++) {
    let kind: ModelKind = o.search ? "search" : o.vision ? "vision" : "general";
    let model = await groqPick(kind);
    if (!model && kind === "search") {
      kind = "general";
      model = await groqPick("general");
    }
    if (!model) return { ok: false, status: kind === "vision" ? 415 : 404, message: kind === "vision" ? "Groq에 사진을 읽는 모델이 없습니다" : "Groq에 쓸 수 있는 모델이 없습니다" };
    const opts = kind === "search" ? o : { ...o, search: false };
    const r = await withFormats(opts, (f) => openAiOnce("Groq", `${GROQ_URL}/chat/completions`, { Authorization: `Bearer ${key}` }, model!, opts, f));
    if (!modelMissing(r) || attempt === 1) return r;
    modelCache("groq").current = { at: 0, ids: null }; // 목록이 바뀌었다 — 새로 받아 다른 모델로
  }
  return { ok: false, status: 404, message: "Groq 모델을 찾지 못했습니다" };
}

// ── OpenRouter — 무료(:free) 모델 ─────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1";
export const openRouterKey = () => aiSetting("OPENROUTER_API_KEY");
const OPENROUTER_PREFS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-chat-v3.1:free",
  "qwen/qwen3-235b-a22b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
];

async function openRouterFreeModels(): Promise<{ id: string; ctx: number; vision: boolean }[] | null> {
  const c = modelCache("openrouter");
  const g = globalThis as unknown as { __semitourOrList?: { id: string; ctx: number; vision: boolean }[] | null };
  if (Date.now() - c.current.at < 60 * 60_000) return g.__semitourOrList ?? null;
  let list: { id: string; ctx: number; vision: boolean }[] | null = null;
  try {
    const res = await fetch(`${OPENROUTER_URL}/models`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as { data?: { id: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; architecture?: { input_modalities?: string[] } }[] };
      list = (data.data ?? [])
        .filter((m) => m.id.endsWith(":free") || (m.pricing?.prompt === "0" && m.pricing?.completion === "0"))
        .map((m) => ({ id: m.id, ctx: m.context_length ?? 8192, vision: (m.architecture?.input_modalities ?? []).includes("image") }));
    }
  } catch {
    list = null;
  }
  g.__semitourOrList = list;
  c.current = { at: Date.now(), ids: list ? new Set(list.map((m) => m.id)) : null };
  return list;
}

export async function openRouterPick(vision = false): Promise<string | null> {
  const env = process.env.OPENROUTER_MODEL?.trim();
  const list = await openRouterFreeModels();
  if (!list) return env || OPENROUTER_PREFS[0];
  const ok = (id: string) => list.some((m) => m.id === id && (!vision || m.vision));
  const pref = [...(env ? [env] : []), ...OPENROUTER_PREFS].find(ok);
  if (pref) return pref;
  const rest = list.filter((m) => m.ctx >= 32_000 && (!vision || m.vision)).sort((a, b) => b.ctx - a.ctx);
  return rest[0]?.id ?? null;
}
export const openRouterModel = () => process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_PREFS[0];

export async function openRouterChat(o: ChatOptions): Promise<ChatResult> {
  const key = openRouterKey();
  if (!key) return { ok: false, status: 0, message: "OPENROUTER_API_KEY 없음" };
  const headers = { Authorization: `Bearer ${key}`, "X-Title": "Semitour Planner" };
  for (let attempt = 0; attempt < 2; attempt++) {
    const model = await openRouterPick(!!o.vision);
    if (!model) return { ok: false, status: o.vision ? 415 : 404, message: o.vision ? "OpenRouter 무료 모델 중 사진을 읽는 것이 없습니다" : "OpenRouter 무료 모델이 없습니다" };
    const opts = { ...o, search: false };
    const r = await withFormats(opts, (f) => openAiOnce("OpenRouter", `${OPENROUTER_URL}/chat/completions`, headers, model, opts, f, 8192));
    if (!modelMissing(r) || attempt === 1) return r;
    modelCache("openrouter").current = { at: 0, ids: null };
  }
  return { ok: false, status: 404, message: "OpenRouter 모델을 찾지 못했습니다" };
}

// ── Cloudflare Workers AI ────────────────────────────────

interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
export async function cfAi(): Promise<AiBinding | null> {
  const b = await workerEnv<AiBinding>("AI");
  return b && typeof b.run === "function" ? b : null;
}
/** 문맥 길이가 긴 모델을 기본으로 (llama-3.3-70b fp8-fast는 24k라 긴 입력·출력에서 넘쳤다) */
const CF_CONTEXT: Record<string, number> = {
  "@cf/meta/llama-4-scout-17b-16e-instruct": 131_000,
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": 24_000,
  "@cf/openai/gpt-oss-120b": 128_000,
  "@cf/openai/gpt-oss-20b": 128_000,
};
export const cfModel = () => process.env.CF_AI_MODEL?.trim() || "@cf/meta/llama-4-scout-17b-16e-instruct";

/** Workers AI의 오류를 상태 코드로 바꾼다 (4006 = 하루 무료 사용량 소진) */
function cfStatus(message: string): number {
  if (/4006|daily free allocation|neurons/i.test(message)) return 429;
  if (/5035|payment|billing/i.test(message)) return 402;
  if (/too many|rate/i.test(message)) return 429;
  if (/context length|maximum context|too long/i.test(message)) return 413;
  return 502;
}

/** 대략 토큰 수 — 한글은 글자당 1토큰 안팎이라 넉넉히 센다 */
export const estimateTokens = (text: string) => Math.ceil(text.length * 0.9) + 20;

/**
 * 문맥 한도 안으로 맞춘다 — 답 길이는 남는 만큼(최대 8192), 그래도 모자라면 가장 긴 메시지의 가운데를 줄인다.
 */
export function fitToContext(messages: { role: string; content: string }[], ctx: number, wantOut = 8192): { messages: { role: string; content: string }[]; maxTokens: number } {
  const MIN_OUT = 1024;
  const budget = ctx - 600;
  let msgs = messages.map((m) => ({ ...m }));
  let input = msgs.reduce((s, m) => s + estimateTokens(m.content), 0);
  if (budget - input < MIN_OUT) {
    const over = input - (budget - Math.min(wantOut, 4096));
    const longest = msgs.reduce((a, m, i) => (m.content.length > msgs[a].content.length ? i : a), 0);
    const keepChars = Math.max(500, msgs[longest].content.length - Math.ceil(over / 0.9));
    const c = msgs[longest].content;
    const head = Math.floor(keepChars * 0.7);
    msgs = msgs.map((m, i) => (i === longest ? { ...m, content: `${c.slice(0, head)}\n…(길어서 줄임)…\n${c.slice(c.length - (keepChars - head))}` } : m));
    input = msgs.reduce((s, m) => s + estimateTokens(m.content), 0);
  }
  return { messages: msgs, maxTokens: Math.max(MIN_OUT, Math.min(wantOut, budget - input)) };
}

export async function cloudflareChat(o: ChatOptions): Promise<ChatResult> {
  const ai = await cfAi();
  if (!ai) return { ok: false, status: 0, message: "Cloudflare AI 바인딩 없음" };
  if (o.vision) return { ok: false, status: 415, message: "Cloudflare AI 대체는 사진을 읽지 않습니다" };
  const model = cfModel();
  const ctx = CF_CONTEXT[model] ?? 24_000;
  // 이 모델은 글만 받는다 — 여러 조각으로 된 내용은 글로 합친다
  const plain = o.messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : m.content.map((c) => (c.type === "text" ? c.text : "")).join("\n") }));
  const run = async (withSchema: boolean, shrink = 1): Promise<ChatResult> => {
    const fitted = fitToContext(plain, Math.floor(ctx * shrink));
    try {
      const input: Record<string, unknown> = { messages: fitted.messages, temperature: o.temperature, max_tokens: fitted.maxTokens };
      if (withSchema && o.jsonSchema) input.response_format = { type: "json_schema", json_schema: o.jsonSchema };
      const out = (await Promise.race([
        ai.run(model, input),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), o.timeoutMs)),
      ])) as { response?: unknown } | null;
      const r = out?.response;
      const text = typeof r === "string" ? r : r !== undefined && r !== null ? JSON.stringify(r) : "";
      return { ok: true, text, truncated: false, sources: [], searched: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, status: message === "timeout" ? 504 : cfStatus(message), message: message.slice(0, 200) };
    }
  };
  let r = await run(true);
  // 문맥 초과(어림이 모자람) → 절반 크기로 줄여 한 번 더
  if (!r.ok && r.status === 413) r = await run(true, 0.5);
  // JSON 모드가 실패하면(형식 오류 등) 형식 지정 없이 한 번 더 — 한도·결제 오류는 그대로
  if (!r.ok && o.jsonSchema && r.status === 502) r = await run(false);
  return r;
}

// ── Tavily 웹 검색 — Gemini·Groq 검색 모델이 없을 때 "웹 근거 있는 조사"를 대신한다 ──

export const tavilyKey = () => aiSetting("TAVILY_API_KEY");

export interface WebResult {
  title: string;
  url: string;
  content: string;
}

/** 검색어로 웹 검색 (키 없거나 실패하면 null) */
export async function tavilySearch(query: string, max = 6): Promise<WebResult[] | null> {
  const key = tavilyKey();
  if (!key) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: query.slice(0, 380), search_depth: "basic", max_results: max, include_answer: false }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (data.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({ title: (r.title ?? r.url ?? "").slice(0, 200), url: r.url!, content: (r.content ?? "").slice(0, 1500) }));
  } catch {
    return null;
  }
}

/** 조사 지시문에서 검색어를 뽑는다 — 첫 줄(질문)에서 지시 문구를 걷어낸다 */
export function searchQueryOf(prompt: string): string {
  const first = prompt.split("\n").find((l) => l.trim().length > 10) ?? prompt;
  return first
    .replace(/Google 검색 도구를 (여러 번 )?사용해서,?\s*/g, "")
    .replace(/(조사해|찾아|알려) 주세요\.?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
