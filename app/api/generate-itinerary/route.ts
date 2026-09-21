import { itineraryRequestSchema, itineraryResponseSchema, toDayPlans } from "@/lib/schemas/itinerary";
import { GeminiError, generateJson } from "@/lib/server/gemini";
import { buildItineraryUserPrompt, ITINERARY_SYSTEM_PROMPT } from "@/lib/server/itineraryPrompt";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = itineraryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }
  const req = parsed.data;

  try {
    const result = await generateJson({
      system: ITINERARY_SYSTEM_PROMPT,
      user: buildItineraryUserPrompt(req),
      schema: itineraryResponseSchema,
    });
    return Response.json({ days: toDayPlans(result, req.days) });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[generate-itinerary]", err);
    return errorResponse("INTERNAL", "일정 생성 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
