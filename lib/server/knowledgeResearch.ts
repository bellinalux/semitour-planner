import { researchSchema, type ResearchResult } from "@/lib/knowledge";
import type { Companion, TravelType, TripScope } from "@/types";
import { generateGroundedText, generateJson, type GroundingSource } from "./gemini";

const SEGMENT_KO: Record<Companion, string> = { senior: "부모님·시니어", kids: "아이 동반 가족", infant: "영유아 동반", couple: "커플·신혼", friends: "친구", group: "단체" };

/**
 * 도시 조사 — 여행자들이 많이 올리고 좋아하는 곳·코스, 다른 여행사 상품에 들어간 곳, 여행자 유형별 니즈를 웹에서 찾는다.
 * 1단계 Google 검색(근거·출처) → 2단계 지식 창고 형식으로 정리. 후기 원문은 옮기지 않고 요약만 받는다.
 */
export async function researchCity(o: { city: string; travelType: TravelType; tripScope: TripScope; companions: Companion[] }): Promise<{ result: ResearchResult; sources: GroundingSource[]; searched: boolean }> {
  const who = o.tripScope === "domestic" ? "한국을 찾는 외국인 관광객" : "한국인 여행자";
  const segs = o.companions.length > 0 ? o.companions.map((c) => SEGMENT_KO[c]).join(", ") : "가족·커플·시니어";
  const memo = await generateGroundedText({
    user: [
      `Google 검색 도구를 여러 번 사용해서 ${o.city} 여행을 조사해 주세요. 대상: ${who}.`,
      "1. 여행 후기·블로그·카페·트립어드바이저·클룩·KKday·마이리얼트립에서 많이 언급되고 평이 좋은 장소(관광지·식당·체험·야경)를 인기순으로 25~35곳. 장소마다 좋다는 점, 불만·주의, 보통 머무는 시간, 가기 좋은 시간을 짧게 요약.",
      o.tripScope === "domestic"
        ? "2. 외국인 대상 투어 판매처(클룩·KKday·Viator·현지 여행사)가 공통으로 넣는 코스와 판매처 이름."
        : "2. 국내 여행사(하나투어·모두투어·노랑풍선·참좋은여행·인터파크·마이리얼트립 등) 상품 일정에 공통으로 들어가는 장소와 인기 하루 코스, 각 코스를 파는 여행사 이름.",
      `3. 여행자 유형별(${segs}, 그리고 공통) 좋아하는 것·피하고 싶어하는 것·일정 짤 때 챙길 것.`,
      `여행 유형 참고: ${o.travelType}. 후기 원문을 길게 옮기지 말고 짧게 요약하세요. 확인하지 못한 것은 쓰지 마세요.`,
    ].join("\n"),
    timeoutMs: 110_000,
  });
  const result = await generateJson({
    system: "당신은 여행 상품 기획자의 조사 정리 담당입니다. 주어진 조사 메모만 근거로 지식 창고 형식(JSON)으로 정리합니다. 메모에 없는 장소·여행사를 지어내지 않습니다. 후기 문장은 인용하지 말고 짧게 요약합니다.",
    user: `<research_memo>\n${memo.text.slice(0, 20000)}\n</research_memo>\n\n도시: ${o.city}`,
    schema: researchSchema,
    temperature: 0.2,
  });
  return { result, sources: memo.sources.slice(0, 8), searched: memo.searched };
}
