/**
 * POST /api/engine/alternatives — 코스 엔진 점검 결과의 문제를 고친 대안 일정을 여러 개 만들고 엔진으로 다시 채점한다.
 */
import { alternativesRequestSchema, suggestAlternatives } from "@/lib/server/engineAlternatives";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { withAiInfo } from "@/lib/server/aiProviders";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

async function handlePost(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const parsed = alternativesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "코스 정보가 올바르지 않습니다.", 400);
  }

  try {
    return Response.json(await suggestAlternatives(parsed.data));
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[engine/alternatives]", err);
    return errorResponse("INTERNAL", "추천 변경안을 만들지 못했습니다.", 500);
  }
}

/** 대체 AI(Groq·Cloudflare)가 답하면 응답 머리글로 화면에 알린다 */
export const POST = withAiInfo(handlePost);
