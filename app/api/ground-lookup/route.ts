/**
 * POST /api/ground-lookup — [전세버스·가이드 조회]
 * 예상 인원으로 차종·대수·가이드 수를 정하고, 회사 요금표 → 웹 조사 순으로 차종별 1대 1일 요금과 가이드 요금 범위를 돌려준다.
 */
import { groundLookupRequestSchema } from "@/lib/schemas/groundLookup";
import { withAiInfo } from "@/lib/server/aiProviders";
import { GeminiError } from "@/lib/server/gemini";
import { lookupGround } from "@/lib/server/groundLookup";
import { guardRequest } from "@/lib/server/guard";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

async function handlePost(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;
  const parsed = groundLookupRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  try {
    return Response.json(await lookupGround(parsed.data));
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[ground-lookup]", err);
    return errorResponse("INTERNAL", "전세버스·가이드 요금 조회 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}

/** 대체 AI(Groq·Cloudflare)가 답하면 응답 머리글로 화면에 알린다 */
export const POST = withAiInfo(handlePost);
