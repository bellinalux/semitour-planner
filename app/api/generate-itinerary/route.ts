import { itineraryRequestSchema, itineraryResponseSchema, toDayPlans } from "@/lib/schemas/itinerary";
import { GeminiError, generateGroundedText, generateJson } from "@/lib/server/gemini";
import {
  buildItineraryResearchPrompt,
  buildItineraryUserPrompt,
  itineraryStructureSystemPrompt,
} from "@/lib/server/itineraryPrompt";
import { guardRequest } from "@/lib/server/guard";
import { mapDayItems } from "@/lib/itinerary";
import type { DayPlan } from "@/types";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/** 웹 검색 근거가 없으면 확인 못한 이용 편의시설 정보를 믿을 수 없으므로 unknown으로 낮춘다 */
function clearUnverifiedAccessibility(days: DayPlan[]): DayPlan[] {
  return days.map((day) =>
    mapDayItems(day, (item) =>
      item.accessibility
        ? {
            ...item,
            accessibility: {
              level: "unknown",
              wheelchairAccessible: false,
              accessibleRestroom: false,
              elevator: false,
              ramp: false,
              note: "웹 검색 근거를 확보하지 못해 확인할 수 없습니다.",
              mustSeeButHard: item.accessibility.mustSeeButHard,
            },
          }
        : item,
    ),
  );
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

  const parsed = itineraryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }
  const req = parsed.data;

  try {
    // 세미투어(기본)가 아니면, 일정을 짜기 전에 여행 유형별 특징을 먼저 웹에서 조사한다
    const research =
      req.travelType === "semi" ? null : await generateGroundedText({ user: buildItineraryResearchPrompt(req) });

    const result = await generateJson({
      system: itineraryStructureSystemPrompt(req.travelType),
      user: buildItineraryUserPrompt(req, research?.text ?? ""),
      schema: itineraryResponseSchema,
    });

    let days = toDayPlans(result, req.days);
    if (req.travelType === "accessible" && !research?.searched) days = clearUnverifiedAccessibility(days);

    return Response.json({
      days,
      sources: research?.sources ?? [],
      researched: research?.searched ?? false,
    });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[generate-itinerary]", err);
    return errorResponse("INTERNAL", "일정 생성 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
