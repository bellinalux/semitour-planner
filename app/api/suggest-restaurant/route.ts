import { restaurantRequestSchema } from "@/lib/schemas/restaurant";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { suggestRestaurants } from "@/lib/server/restaurantSuggest";
import { withAiInfo } from "@/lib/server/aiProviders";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/** 동선상 식당 찾기 — 식사 무렵 일행이 있는 지역 안의 식당 (다른 지역 식당에 갔다가 되돌아오는 지그재그를 없앤다) */
async function handlePost(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = restaurantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    return Response.json(await suggestRestaurants(parsed.data));
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[suggest-restaurant]", err);
    return errorResponse("INTERNAL", "식당을 찾는 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}

/** 대체 AI(Groq·Cloudflare)가 답하면 응답 머리글로 화면에 알린다 */
export const POST = withAiInfo(handlePost);
