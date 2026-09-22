import { flightOptionsRequestSchema, flightOptionsResponseSchema, toFlightOptions } from "@/lib/schemas/flightOptions";
import {
  buildFlightOptionsResearchPrompt,
  buildFlightOptionsStructurePrompt,
  FLIGHT_OPTIONS_STRUCTURE_SYSTEM_PROMPT,
} from "@/lib/server/flightOptionsPrompt";
import { GeminiError, generateGroundedText, generateJson } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * API가 아니라 AI 웹 검색으로 개별 항공편을 여러 개 찾는다 (편명·시간·공항·직항 여부까지).
 * "/api/search-flight-price"(가격대만 빠르게)와 별개로, 실제 편을 골라 지정하고 싶을 때 쓴다.
 */
export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = flightOptionsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    // 1단계: Google 검색으로 조사 (출처 수집)
    const research = await generateGroundedText({ user: buildFlightOptionsResearchPrompt(parsed.data) });

    // 2단계: 조사 메모를 JSON으로 정리 (메모에 없는 내용은 만들지 않는다)
    const structured = await generateJson({
      system: FLIGHT_OPTIONS_STRUCTURE_SYSTEM_PROMPT,
      user: buildFlightOptionsStructurePrompt(parsed.data, research.text),
      schema: flightOptionsResponseSchema,
      temperature: 0.1,
    });

    const flights = toFlightOptions(structured, parsed.data, research.searched);
    return Response.json({ flights, sources: research.sources, searched: research.searched, checkedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[search-flight-options]", err);
    return errorResponse("INTERNAL", "항공편 검색 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
