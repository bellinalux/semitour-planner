/**
 * POST /api/studio/gemini?m=models/gemini-2.5-flash:generateContent[&alt=sse]
 *   다른 스튜디오(상세페이지 스튜디오 등)의 Gemini 요청을 서버 키로 대신 보낸다. 요청·응답 본문은 Gemini 그대로.
 *   헤더: X-Studio-Code(접근 코드, 필수), X-Studio-Cache: 1 이면 같은 요청을 하루 동안 저장해 다시 씀
 * GET  /api/studio/gemini — 연결 확인 { ok, codeRequired, codeOk }
 */
import { resolveKey } from "@/lib/server/gemini";
import { allowAiCall } from "@/lib/server/rateLimit";
import {
  aiCache, allowedOrigin, CACHE_TTL_SECONDS, cacheKey, corsHeaders, MAX_BODY_BYTES, MODEL_PATH, studioAccess,
} from "@/lib/server/studio";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function json(body: unknown, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers });
}
function err(code: string, message: string, status: number, headers: Record<string, string>) {
  return json({ error: { code, message } }, status, headers);
}

export async function OPTIONS(request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(request: Request) {
  const origin = allowedOrigin(request);
  const headers = origin ? corsHeaders(origin) : {};
  const access = await studioAccess(request);
  let keyOk = true;
  try { resolveKey(); } catch { keyOk = false; }
  return json({ ok: access === "ok" && keyOk, codeRequired: access !== "off", codeOk: access === "ok", keyOk, originOk: !!origin }, 200, headers);
}

export async function POST(request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(JSON.stringify({ error: { code: "ORIGIN", message: "허용되지 않은 사이트입니다." } }), { status: 403, headers: { "Content-Type": "application/json" } });
  const cors = corsHeaders(origin);

  const access = await studioAccess(request);
  if (access === "off") return err("NO_ACCESS_CODE", "서버에 접근 코드(APP_ACCESS_CODE)를 설정해야 스튜디오 AI 중계를 쓸 수 있습니다.", 403, cors);
  if (access === "bad") return err("UNAUTHORIZED", "접근 코드가 올바르지 않습니다. 상세페이지 스튜디오 설정에서 AI 서버 접근 코드를 확인해 주세요.", 401, cors);
  if (!(await allowAiCall(request))) return err("RATE_LIMITED", "요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요.", 429, { ...cors, "Retry-After": "60" });

  const url = new URL(request.url);
  const path = url.searchParams.get("m") ?? "";
  const stream = url.searchParams.get("alt") === "sse";
  if (!MODEL_PATH.test(path)) return err("BAD_REQUEST", "요청 경로가 올바르지 않습니다.", 400, cors);

  const body = await request.text();
  if (!body || body.length > MAX_BODY_BYTES) return err("BAD_REQUEST", "요청 본문이 비어 있거나 너무 큽니다.", 400, cors);

  let apiKey: string;
  try { apiKey = resolveKey(); } catch (e) { return err("NO_KEY", e instanceof Error ? e.message : "서버에 Gemini 키가 없습니다.", 500, cors); }

  // 같은 요청 저장해 두고 다시 쓰기 (스트리밍이 아닐 때만)
  const useCache = !stream && request.headers.get("x-studio-cache") === "1";
  const cache = useCache ? await aiCache() : null;
  const ck = cache ? await cacheKey(path, body) : "";
  if (cache) {
    const hit = await cache.get(ck);
    if (hit) return new Response(hit, { status: 200, headers: { ...cors, "Content-Type": "application/json", "X-Studio-Cache": "HIT" } });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${GEMINI_BASE}/${path}${stream ? "?alt=sse" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
    });
  } catch (e) {
    console.error("[studio/gemini] 연결 실패", e);
    return err("UPSTREAM", "AI 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 502, cors);
  }

  if (stream) {
    return new Response(upstream.body, { status: upstream.status, headers: { ...cors, "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream" } });
  }
  const text = await upstream.text();
  if (cache && upstream.ok) {
    try { await cache.put(ck, text, { expirationTtl: CACHE_TTL_SECONDS }); } catch (e) { console.warn("[studio/gemini] 캐시 저장 실패", e); }
  }
  return new Response(text, { status: upstream.status, headers: { ...cors, "Content-Type": "application/json", "X-Studio-Cache": cache ? "MISS" : "OFF" } });
}
