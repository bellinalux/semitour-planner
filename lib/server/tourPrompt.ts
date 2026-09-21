import { TOUR_CATEGORY_MAP } from "@/lib/itemTypes";
import type { TourRequest } from "@/lib/schemas/tours";

/** 1단계: Google 검색으로 조사하는 요청 (자유 서술) */
export function buildTourResearchPrompt(req: TourRequest): string {
  const kinds = req.categories.map((id) => `- ${TOUR_CATEGORY_MAP[id].label}: ${TOUR_CATEGORY_MAP[id].query}`);

  return [
    `Google 검색 도구를 여러 번 사용해서, ${req.destination}에서 여행객이 실제로 많이 예약하는 지역 투어를 찾아 조사해 주세요.`,
    "예약 플랫폼(Viator, GetYourGuide, Klook, 마이리얼트립 등)이나 운영 업체 사이트에 실제로 판매 중인 상품만 넣고, 기억에 의존해 상품명이나 요금을 지어내지 마세요.",
    "",
    "찾을 투어 종류 (종류마다 1~3개, 전체 6~10개):",
    ...kinds,
    "",
    "투어마다 아래 항목을 조사 메모로 정리해 주세요. 검색으로 확인하지 못한 항목은 '확인 못함'이라고 쓰세요.",
    "1. 정확한 상품명과 투어 종류",
    "2. 소요 시간",
    `3. 1인 요금 범위 (${req.currency} 기준, 어느 사이트에서 확인했는지)`,
    "4. 요금에 포함되는 것 (입장권, 가이드, 식사, 이동수단 등)",
    "5. 예약 필요 여부, 집합 장소, 운영 요일",
    "6. 한국어 가이드나 한국어 후기가 있는지 (있다면 근거와 출처 사이트)",
    "7. 추천 이유 한 줄",
    "",
    "가격대와 성격이 서로 다른 투어를 골고루 넣어 주세요.",
  ].join("\n");
}

export const TOUR_STRUCTURE_SYSTEM_PROMPT = `당신은 투어 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 내용만 사용합니다. 메모에 없는 투어, 요금, 포함 내역을 새로 만들지 않습니다.
- 메모에서 '확인 못함'이라고 한 항목은 비워 둡니다: includes와 booking은 빈 문자열, durationMinutes는 0.
- priceBasis는 메모에서 예약 사이트 등으로 요금이 확인됐다고 한 경우에만 searched이고, 그렇지 않으면 estimated입니다. estimated인 경우 priceLow/priceHigh에는 메모의 대략적인 값(없으면 통상 시세)을 넣습니다.
- koreanGuide는 메모가 한국어 가이드나 한국어 후기를 근거와 함께 확인한 경우에만 true이고 근거를 koreanNote에 한 줄로 적습니다. 그렇지 않으면 false이고 koreanNote는 빈 문자열입니다.
- category는 요청한 종류 중 가장 알맞은 것 하나로 합니다.
- 요금은 1인 기준입니다. 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 2단계: 조사 메모를 JSON으로 정리하는 요청 */
export function buildTourStructurePrompt(req: TourRequest, memo: string): string {
  return [
    `요청 통화: ${req.currency} (priceLow, priceHigh는 1인 요금이며 이 통화 단위의 숫자)`,
    `요청한 종류: ${req.categories.join(", ")}`,
    "",
    "<research_memo>",
    memo,
    "</research_memo>",
    "",
    "위 조사 메모를 스키마에 맞게 정리해 주세요.",
  ].join("\n");
}
