import { competitorItineraryRequestSchema } from "@/lib/schemas/competitorItinerary";
import { fetchCompetitorItinerary } from "@/lib/server/competitorItinerary";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/** 경쟁 상품 일정 가져오기 — 판매 페이지의 날짜별 방문지·식사·호텔·자유일정 */
export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const parsed = competitorItineraryRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  try {
    return Response.json({ itinerary: await fetchCompetitorItinerary(parsed.data) });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[competitor-itinerary]", err);
    return errorResponse("INTERNAL", "경쟁 상품 일정을 읽는 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
