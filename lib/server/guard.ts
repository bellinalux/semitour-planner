import { isAuthed } from "./access";
import { allowAiCall } from "./rateLimit";

function errorResponse(code: string, message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers });
}

/**
 * AI를 호출하는 API의 맨 앞에서 부른다.
 * 접근 코드가 필요한데 없거나(401), 호출이 너무 잦으면(429) 그 응답을 돌려주고, 통과하면 null을 돌려준다.
 */
export async function guardRequest(request: Request): Promise<Response | null> {
  if (!(await isAuthed(request))) {
    return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다. 화면을 새로고침해 접근 코드를 입력해 주세요.", 401);
  }
  if (!(await allowAiCall(request))) {
    return errorResponse("RATE_LIMITED", "요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요.", 429, { "Retry-After": "60" });
  }
  return null;
}
