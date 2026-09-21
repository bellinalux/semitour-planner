import { travelRequestSchema, travelResponseSchema, toTravelEstimate } from "@/lib/schemas/travel";
import { GeminiError, generateJson } from "@/lib/server/gemini";
import { buildTravelUserPrompt, TRAVEL_SYSTEM_PROMPT } from "@/lib/server/travelPrompt";

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

  const parsed = travelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    const result = await generateJson({
      system: TRAVEL_SYSTEM_PROMPT,
      user: buildTravelUserPrompt(parsed.data),
      schema: travelResponseSchema,
      temperature: 0.3,
      timeoutMs: 60_000,
    });
    return Response.json({ estimate: toTravelEstimate(result) });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[estimate-travel]", err);
    return errorResponse("INTERNAL", "시세 추정 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
