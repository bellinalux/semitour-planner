/**
 * 스튜디오 AI 중계 — 상세페이지 스튜디오(tourdesign) 같은 다른 웹이 Gemini를 부를 때 이 서버를 거치게 한다.
 *  - API 키는 이 서버에만 있다(브라우저에 키를 넣지 않아도 된다).
 *  - 다른 사이트에서 오는 요청이라 로그인 쿠키를 못 쓰므로, 접근 코드를 X-Studio-Code 헤더로 받는다.
 *  - 허용한 사이트(STUDIO_ORIGINS)에서 온 요청만 받는다.
 *  - 같은 조사 요청은 하루 동안 저장해 두고 다시 쓴다(AI_CACHE KV) — 비용 절약.
 * ⚠ 접근 코드(APP_ACCESS_CODE)가 설정되지 않은 서버에서는 중계를 열지 않는다(아무나 키를 쓰게 되므로).
 */
import { accessRequired, codeMatches } from "./access";
import { AUTH_BLOCKED_MESSAGE, AUTH_RETRY_AFTER, authBlocked, authFailed } from "./authThrottle";
import { workerEnv } from "./cfEnv";

/** 환경변수 STUDIO_ORIGINS(쉼표 구분) — 넣으면 그 사이트들만 허용하는 엄격 모드 */
export function studioOrigins(): string[] {
  return (process.env.STUDIO_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
}

/**
 * 요청한 사이트를 허용하면 그 주소(브라우저에 돌려줄 Access-Control-Allow-Origin), 아니면 null.
 * 상세페이지 스튜디오는 PC 파일(file:// → "null")·여러 주소에서 열리므로, STUDIO_ORIGINS를 정하지 않았으면 어느 사이트든 허용한다.
 * 진짜 열쇠는 접근 코드(X-Studio-Code)다 — 코드가 없거나 틀리면 어떤 사이트에서 와도 막힌다.
 */
export function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const strict = studioOrigins();
  return !strict.length || strict.includes(origin) ? origin : null;
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Studio-Code, X-Studio-Cache",
    "Access-Control-Expose-Headers": "X-Studio-Cache",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * 접근 코드 확인. 서버에 코드가 없으면(잠금 꺼짐) 중계 자체를 막는다 → "off"
 * 틀린 코드가 잦거나 시도가 너무 많으면 코드를 확인하지 않고 "blocked" (호출한 곳은 429로 돌려준다)
 * — 다른 사이트에서도 부를 수 있는 주소라 무차별 대입을 여기서 막는다.
 */
export async function studioAccess(request: Request): Promise<"ok" | "bad" | "off" | "blocked"> {
  if (!accessRequired()) return "off";
  const code = (request.headers.get("x-studio-code") ?? "").trim();
  // 코드 없이 온 요청(연결 확인 등)은 맞혀 보는 시도가 아니므로 세지 않는다
  if (!code) return "bad";
  if (await authBlocked(request)) return "blocked";
  if (await codeMatches(code)) return "ok";
  await authFailed(request);
  return "bad";
}

/** studioAccess가 "blocked"일 때 돌려줄 응답 */
export function studioBlockedResponse(headers: Record<string, string>): Response {
  return Response.json(
    { error: { code: "TOO_MANY_ATTEMPTS", message: AUTH_BLOCKED_MESSAGE } },
    { status: 429, headers: { ...headers, "Retry-After": AUTH_RETRY_AFTER } },
  );
}

/** Gemini 경로: models/모델이름:generateContent | streamGenerateContent 만 허용 */
export const MODEL_PATH = /^models\/[a-z0-9.\-]+:(generateContent|streamGenerateContent)$/i;

interface CacheKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}
export async function aiCache(): Promise<CacheKv | null> {
  const kv = await workerEnv<CacheKv>("AI_CACHE");
  return kv && typeof kv.get === "function" ? kv : null;
}
export async function cacheKey(path: string, body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${path}\n${body}`));
  return "aic:" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
export const CACHE_TTL_SECONDS = 60 * 60 * 24;
export const MAX_BODY_BYTES = 20 * 1024 * 1024;
