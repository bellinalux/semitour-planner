/**
 * AI 대체 업체 — Gemini가 한도·크레딧 소진·장애로 안 될 때 이어 받는다.
 *  - 순서: 환경변수 AI_PROVIDERS (기본 "gemini,groq,cloudflare"). 키·연결이 없는 업체는 건너뛴다.
 *  - 한 번 한도에 걸린 업체는 잠시(쿨다운) 부르지 않는다 — 매번 실패를 기다리지 않게.
 *  - Groq: OpenAI 호환 API(GROQ_API_KEY). 검색 조사는 웹 검색이 들어 있는 groq/compound 모델.
 *  - Cloudflare Workers AI: Worker 바인딩(AI) — 키가 필요 없다. 웹 검색은 없다.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { workerEnv } from "./cfEnv";
import { aiSetting } from "./aiSettings";

export type ProviderId = "gemini" | "groq" | "cloudflare";
export const PROVIDER_LABEL: Record<ProviderId, string> = { gemini: "Gemini", groq: "Groq", cloudflare: "Cloudflare AI" };

export function providerOrder(): ProviderId[] {
  const raw = (aiSetting("AI_PROVIDERS") ?? "gemini,groq,cloudflare").split(",").map((s) => s.trim().toLowerCase());
  const valid = raw.filter((p): p is ProviderId => p === "gemini" || p === "groq" || p === "cloudflare");
  const unique = [...new Set(valid)];
  return unique.length ? unique : ["gemini", "groq", "cloudflare"];
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
    gemini: { key: !!aiSetting("GEMINI_API_KEY"), ...view("gemini") },
    groq: { key: !!groqKey(), model: groqModel(), searchModel: groqSearchModel(), ...view("groq") },
    cloudflare: { binding: (await cfAi()) !== null, model: cfModel(), ...view("cloudflare") },
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

// ── Groq ──────────────────────────────────────────────

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** 앱 "AI 키 설정"에 넣은 값 > Cloudflare 변수 */
export const groqKey = () => aiSetting("GROQ_API_KEY");
export const groqModel = () => process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
export const groqSearchModel = () => process.env.GROQ_SEARCH_MODEL?.trim() || "groq/compound";
export const groqVisionModel = () => process.env.GROQ_VISION_MODEL?.trim() || "meta-llama/llama-4-scout-17b-16e-instruct";

interface OpenAiResponse {
  choices?: {
    message?: {
      content?: string | null;
      executed_tools?: { type?: string; search_results?: { results?: { title?: string; url?: string }[] } }[];
    };
    finish_reason?: string;
  }[];
  error?: { message?: string };
}

async function groqOnce(o: ChatOptions, format: "schema" | "object" | "none"): Promise<ChatResult> {
  const key = groqKey();
  if (!key) return { ok: false, status: 0, message: "GROQ_API_KEY 없음" };
  const model = o.search ? groqSearchModel() : o.vision ? groqVisionModel() : groqModel();
  const body: Record<string, unknown> = { model, messages: o.messages, temperature: o.temperature, max_completion_tokens: 16384 };
  if (format === "schema" && o.jsonSchema) body.response_format = { type: "json_schema", json_schema: { name: "result", schema: o.jsonSchema, strict: false } };
  else if (format === "object") body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(o.timeoutMs),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, status: timeout ? 504 : 502, message: timeout ? "Groq 응답 시간 초과" : "Groq 연결 실패" };
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

/** Groq 호출. 구조화 출력이 거절되면(400) JSON 모드로, 그것도 거절되면 형식 지정 없이 한 번 더 */
export async function groqChat(o: ChatOptions): Promise<ChatResult> {
  const formats: ("schema" | "object" | "none")[] = o.search ? ["none"] : o.jsonSchema ? (o.vision ? ["object", "none"] : ["schema", "object", "none"]) : ["none"];
  let last: ChatResult = { ok: false, status: 0, message: "Groq 호출 안 함" };
  for (const f of formats) {
    last = await groqOnce(o, f);
    if (last.ok || last.status !== 400) return last;
  }
  return last;
}

// ── Cloudflare Workers AI ────────────────────────────────

interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
export async function cfAi(): Promise<AiBinding | null> {
  const b = await workerEnv<AiBinding>("AI");
  return b && typeof b.run === "function" ? b : null;
}
export const cfModel = () => process.env.CF_AI_MODEL?.trim() || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Workers AI의 오류를 상태 코드로 바꾼다 (4006 = 하루 무료 사용량 소진) */
function cfStatus(message: string): number {
  if (/4006|daily free allocation|neurons/i.test(message)) return 429;
  if (/5035|payment|billing/i.test(message)) return 402;
  if (/too many|rate/i.test(message)) return 429;
  return 502;
}

export async function cloudflareChat(o: ChatOptions): Promise<ChatResult> {
  const ai = await cfAi();
  if (!ai) return { ok: false, status: 0, message: "Cloudflare AI 바인딩 없음" };
  if (o.vision) return { ok: false, status: 415, message: "Cloudflare AI 대체는 사진을 읽지 않습니다" };
  // 이 모델은 글만 받는다 — 여러 조각으로 된 내용은 글로 합친다
  const messages = o.messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : m.content.map((c) => (c.type === "text" ? c.text : "")).join("\n") }));
  const run = async (withSchema: boolean): Promise<ChatResult> => {
    try {
      const input: Record<string, unknown> = { messages, temperature: o.temperature, max_tokens: 8192 };
      if (withSchema && o.jsonSchema) input.response_format = { type: "json_schema", json_schema: o.jsonSchema };
      const out = (await Promise.race([
        ai.run(cfModel(), input),
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
  const first = await run(true);
  // JSON 모드가 실패하면(형식 오류 등) 형식 지정 없이 한 번 더 — 한도·결제 오류는 그대로
  if (!first.ok && o.jsonSchema && first.status === 502) return run(false);
  return first;
}
