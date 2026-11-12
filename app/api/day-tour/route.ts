import { dayTourRequestSchema } from "@/lib/schemas/dayTour";
import { planDayTour } from "@/lib/server/dayTour";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { withAiInfo } from "@/lib/server/aiProviders";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/** 근교 투어(반일·당일) 만들기 — 코스·이동 구간(차량·대중교통·도보)·현지 비용 시세·비슷한 판매 투어 */
async function handlePost(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = dayTourRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    const result = await planDayTour(parsed.data);
    if (result.stops.length === 0) return errorResponse("BAD_OUTPUT", "코스를 만들지 못했습니다. 지역이나 테마를 바꿔 다시 시도해 주세요.", 422);
    return Response.json(result);
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[day-tour]", err);
    return errorResponse("INTERNAL", "근교 투어를 만드는 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}

/** 대체 AI(Groq·Cloudflare)가 답하면 응답 머리글로 화면에 알린다 */
export const POST = withAiInfo(handlePost);
