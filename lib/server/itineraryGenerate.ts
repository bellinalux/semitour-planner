/**
 * AI 일정 생성 — 직원 화면(/api/generate-itinerary)과 고객용 코스 만들기(/api/public-plan)가 함께 쓴다.
 * 지식 창고(인기·다른 여행사·현장·고객·판매)를 먼저 보고, 필요하면 여행 유형별 웹 조사 뒤 일정을 만든다.
 */
import { itineraryResponseSchema, toDayPlans, type ItineraryRequest } from "@/lib/schemas/itinerary";
import { generateGroundedText, generateJson } from "@/lib/server/gemini";
import {
  buildItineraryResearchPrompt,
  buildItineraryUserPrompt,
  itineraryStructureSystemPrompt,
  needsItineraryResearch,
} from "@/lib/server/itineraryPrompt";
import { annotateReasons, knowledgeForTrip } from "@/lib/server/knowledgeForTrip";
import { bumpMetric } from "@/lib/server/knowledgeStore";
import { mapDayItems } from "@/lib/itinerary";
import type { DayPlan, SearchSource } from "@/types";

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

export async function generateItineraryDays(req: ItineraryRequest, opts: { research?: boolean } = {}): Promise<{ days: DayPlan[]; sources: SearchSource[]; researched: boolean; knowledge: Awaited<ReturnType<typeof knowledgeForTrip>>["info"] }> {
  // 세미투어(기본)이면서 해외여행이면 조사 없이 바로 만들고, 그 외(다른 여행 유형이거나 국내=외국인 대상 투어)는
  // 일정을 짜기 전에 여행 유형별 특징(또는 외국인에게 인기 있는 명소)을 먼저 웹에서 조사한다
  // 지식 창고(여행자 인기·다른 여행사·우리 현장·고객·판매 결과)를 먼저 보고, 없거나 오래됐으면 웹에서 조사해 쌓는다
  const [research, knowledge] = await Promise.all([
    opts.research !== false && needsItineraryResearch(req) ? generateGroundedText({ user: buildItineraryResearchPrompt(req) }) : Promise.resolve(null),
    knowledgeForTrip(req, { research: opts.research !== false }).catch(() => ({ docs: [], memo: "", info: [] })),
  ]);
  const result = await generateJson({
    system: itineraryStructureSystemPrompt(req.travelType, req.tripScope),
    user: buildItineraryUserPrompt(req, research?.text ?? "", knowledge.memo),
    schema: itineraryResponseSchema,
  });
  let days = annotateReasons(toDayPlans(result, req.days), knowledge.docs);
  if (req.travelType === "accessible" && !research?.searched) days = clearUnverifiedAccessibility(days);
  // 발전 지표: AI가 넣은 장소 수 (나중에 직원이 지운 비율을 본다)
  await bumpMetric({
    aiPlaces: days.flatMap((d) => [...d.items, ...d.amGuided, ...(d.pmFreeOptions[0]?.items ?? [])]).filter((i) => !["free_time", "meal", "flight", "transfer", "hotel"].includes(i.type ?? "sightseeing")).length,
  });
  return { days, sources: research?.sources ?? [], researched: research?.searched ?? false, knowledge: knowledge.info };
}
