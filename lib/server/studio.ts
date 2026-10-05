/**
 * 스튜디오 AI 중계 — 상세페이지 스튜디오(tourdesign) 같은 다른 웹이 Gemini를 부를 때 이 서버를 거치게 한다.
 *  - API 키는 이 서버에만 있다(브라우저에 키를 넣지 않아도 된다).
 *  - 다른 사이트에서 오는 요청이라 로그인 쿠키를 못 쓰므로, 접근 코드를 X-Studio-Code 헤더로 받는다.
 *  - 허용한 사이트(STUDIO_ORIGINS)에서 온 요청만 받는다.
 *  - 같은 조사 요청은 하루 동안 저장해 두고 다시 쓴다(AI_CACHE KV) — 비용 절약.
 * ⚠ 접근 코드(APP_ACCESS_CODE)가 설정되지 않은 서버에서는 중계를 열지 않는다(아무나 키를 쓰게 되므로).
 */
import { accessRequired, codeMatches } from "./access";
import { workerEnv } from "./cfEnv";

const DEFAULT_ORIGINS = ["https://bellinalux.github.io", "http://localhost:3010", "http://127.0.0.1:3010"];

/** 요청을 허용할 사이트 목록 — 환경변수 STUDIO_ORIGINS(쉼표 구분)가 있으면 그것, 없으면 기본값 */
export function studioOrigins(): string[] {
  const list = (process.env.STUDIO_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  return list.length ? list : DEFAULT_ORIGINS;
}

/** 요청한 사이트가 허용 목록에 있으면 그 주소, 아니면 null */
export function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  return origin && studioOrigins().includes(origin) ? origin : null;
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Studio-Code, X-Studio-Cache",
    "Access-Control-Expose-Headers": "X-Studio-Cache",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** 접근 코드 확인. 서버에 코드가 없으면(잠금 꺼짐) 중계 자체를 막는다 → "off" */
export async function studioAccess(request: Request): Promise<"ok" | "bad" | "off"> {
  if (!accessRequired()) return "off";
  const code = request.headers.get("x-studio-code") ?? "";
  return (await codeMatches(code)) ? "ok" : "bad";
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
