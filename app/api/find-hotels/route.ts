import { hotelRequestSchema, hotelResponseSchema, toHotelCandidates } from "@/lib/schemas/hotels";
import { GeminiError, generateGroundedText, generateJson } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import {
  buildHotelResearchPrompt,
  buildHotelStructurePrompt,
  HOTEL_STRUCTURE_SYSTEM_PROMPT,
} from "@/lib/server/hotelPrompt";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = hotelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    // 1단계: Google 검색으로 조사 (출처 수집)
    const research = await generateGroundedText({ user: buildHotelResearchPrompt(parsed.data) });

    // 2단계: 조사 메모를 JSON으로 정리 (메모에 없는 내용은 만들지 않는다)
    const structured = await generateJson({
      system: HOTEL_STRUCTURE_SYSTEM_PROMPT,
      user: buildHotelStructurePrompt(parsed.data, research.text),
      schema: hotelResponseSchema,
      temperature: 0.1,
    });

    const hotels = toHotelCandidates(structured, parsed.data.destination).map((h) =>
      // 검색 근거가 없으면 "검색 확인", "한국인 이용 확인", 역·도보 정보를 믿을 수 없으므로 지운다
      research.searched
        ? h
        : { ...h, priceBasis: "estimated" as const, koreanFriendly: false, koreanNote: "", nearestStation: "", walkMinutes: 0 },
    );
    if (hotels.length === 0) {
      return errorResponse("BAD_OUTPUT", "조건에 맞는 숙소를 찾지 못했습니다. 조건을 줄여서 다시 시도해 주세요.", 422);
    }
    return Response.json({
      hotels,
      sources: research.sources,
      searched: research.searched,
      searchedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[find-hotels]", err);
    return errorResponse("INTERNAL", "숙소 검색 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
