/**
 * 코스 엔진 API 공용 확인 — 같은 주소를 두 곳에서 부른다.
 *  - 세미투어 화면(같은 사이트): 로그인 쿠키 + 호출 제한 (guardRequest)
 *  - 상세페이지 스튜디오(다른 사이트): 허용 사이트 + X-Studio-Code 접근 코드 + 호출 제한, CORS 헤더
 */
import { guardRequest } from "./guard";
import { allowAiCall } from "./rateLimit";
import { allowedOrigin, corsHeaders, studioAccess } from "./studio";

export async function engineGuard(request: Request, ai = true): Promise<{ headers: Record<string, string> } | Response> {
  const origin = allowedOrigin(request);
  if (origin && request.headers.has("x-studio-code")) {
    const cors = corsHeaders(origin);
    const access = await studioAccess(request);
    if (access !== "ok") {
      return Response.json({ error: { code: access === "off" ? "NO_ACCESS_CODE" : "UNAUTHORIZED", message: access === "off" ? "서버에 접근 코드(APP_ACCESS_CODE)가 설정되어 있지 않습니다." : "접근 코드가 올바르지 않습니다." } }, { status: access === "off" ? 403 : 401, headers: cors });
    }
    if (ai && !(await allowAiCall(request))) {
      return Response.json({ error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요." } }, { status: 429, headers: { ...cors, "Retry-After": "60" } });
    }
    return { headers: cors };
  }
  const blocked = await guardRequest(request);
  return blocked ?? { headers: {} };
}

export function engineOptions(request: Request): Response {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
