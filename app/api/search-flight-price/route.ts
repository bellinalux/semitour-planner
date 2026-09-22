import { flightWebRequestSchema, flightWebResponseSchema, toFlightWebEstimate } from "@/lib/schemas/flightSearch";
import {
  buildFlightResearchPrompt,
  buildFlightStructurePrompt,
  FLIGHT_STRUCTURE_SYSTEM_PROMPT,
} from "@/lib/server/flightSearchPrompt";
import { GeminiError, generateGroundedText, generateJson } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * API가 아니라 AI 웹 검색(Google Flights, 네이버 항공권, 스카이스캐너 등)으로 항공 요금을 확인한다.
 * 키·가입이 필요 없고, Travelpayouts 조회(캐시된 노선 DB)를 보완하는 용도다.
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

  const parsed = flightWebRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    // 1단계: Google 검색으로 조사 (출처 수집)
    const research = await generateGroundedText({ user: buildFlightResearchPrompt(parsed.data) });

    // 2단계: 조사 메모를 JSON으로 정리 (메모에 없는 내용은 만들지 않는다)
    const structured = await generateJson({
      system: FLIGHT_STRUCTURE_SYSTEM_PROMPT,
      user: buildFlightStructurePrompt(parsed.data, research.text),
      schema: flightWebResponseSchema,
      temperature: 0.1,
    });

    const estimate = toFlightWebEstimate(structured, parsed.data);
    // 검색 근거가 없으면 "검색 확인" 표시를 믿을 수 없으므로 낮춘다
    const final = research.searched ? estimate : { ...estimate, basis: "estimated" as const, sourceName: "" };

    return Response.json({ estimate: final, sources: research.sources, searched: research.searched });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[search-flight-price]", err);
    return errorResponse("INTERNAL", "항공 요금 검색 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
