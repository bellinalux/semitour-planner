import type { CompetitorRequest } from "@/lib/schemas/competitors";

/** 국내 대형 여행사·온라인 여행 플랫폼 (검색 대상으로 제시한다) */
const AGENCIES = ["하나투어", "모두투어", "노랑풍선", "참좋은여행", "인터파크투어", "교원투어 여행이지", "롯데관광", "한진관광", "마이리얼트립", "웹투어"];

const PACKAGE_LABEL: Record<CompetitorRequest["packageType"], string> = {
  land: "현지 지상 일정만 판매하는 랜드 상품(항공·숙박 불포함)",
  land_hotel: "숙박과 현지 일정을 묶어 파는 상품(항공 불포함)",
  full: "항공·숙박·현지 일정을 모두 묶은 풀패키지",
};

/** 1단계: Google 검색으로 경쟁 상품을 조사하는 요청 (자유 서술) */
export function buildCompetitorResearchPrompt(req: CompetitorRequest): string {
  const span = req.nights > 0 ? `${req.nights}박 ${req.days}일` : `${req.days}일`;
  const origin = req.originCity.trim() || "인천";

  return [
    `Google 검색 도구를 여러 번 사용해서, 한국 여행사들이 지금 판매 중인 "${req.destination} ${span}" 패키지 상품을 찾아 조사해 주세요.`,
    `우리 상품은 ${PACKAGE_LABEL[req.packageType]}이며, 비교 대상도 되도록 비슷한 구성으로 찾습니다.`,
    req.packageType === "full" ? `출발지는 ${origin}입니다.` : "",
    "",
    `아래 여행사 위주로 검색하세요: ${AGENCIES.join(", ")}.`,
    "각 여행사의 실제 판매 페이지에 있는 상품만 넣고, 기억에 의존해 상품명이나 요금을 지어내지 마세요.",
    "서로 다른 여행사에서 3~6개를 고르되, 가격대(저가·중가·고가)가 골고루 섞이도록 하세요.",
    "",
    "상품마다 아래를 조사 메모로 정리해 주세요. 검색으로 확인하지 못한 항목은 '확인 못함'이라고 쓰세요.",
    "1. 여행사 이름과 정확한 상품명",
    `2. 성인 1인 요금 (${req.currency} 기준). 유류할증료·제세공과금 별도인지, 출발일에 따라 달라지는지도 적으세요.`,
    "3. 숙박 수와 총 일수, 호텔 등급 표기",
    "4. 포함 내역: 왕복 항공, 숙박, 식사, 전용 차량, 가이드 동행, 입장료 각각 포함 여부",
    "5. 노쇼핑·노옵션을 내세우는지",
    "6. 이 상품의 특징 한 줄 (예: 5성 리조트 연박, 자유일정 포함)",
    "7. 요금을 확인한 사이트 이름",
    "",
    "요금은 성인 1인, 2인 1실 기준의 대표 출발일 요금으로 적습니다.",
  ]
    .filter(Boolean)
    .join("\n");
}

export const COMPETITOR_STRUCTURE_SYSTEM_PROMPT = `당신은 경쟁 상품 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 내용만 사용합니다. 메모에 없는 상품, 여행사, 요금, 포함 내역을 새로 만들지 않습니다.
- 메모에서 '확인 못함'이라고 한 항목은 비워 둡니다: 문자열은 빈 문자열, 숫자는 0, 포함 여부는 false.
- basis는 메모가 판매 페이지에서 요금을 확인했다고 한 경우에만 searched이고, 그렇지 않으면 estimated입니다.
- 포함 여부(includes*)는 메모가 포함이라고 밝힌 경우에만 true로 합니다. 언급이 없으면 false입니다.
- noShopping과 noOption은 상품이 그렇게 내세운다고 메모에 적힌 경우에만 true입니다.
- 요금은 성인 1인 기준의 숫자만 넣고 통화 기호나 쉼표는 넣지 않습니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 2단계: 조사 메모를 JSON으로 정리하는 요청 */
export function buildCompetitorStructurePrompt(req: CompetitorRequest, memo: string): string {
  return [
    `요청 통화: ${req.currency} (pricePerPerson은 이 통화 단위의 숫자)`,
    `비교 대상: ${req.destination} ${req.nights}박 ${req.days}일`,
    "",
    "<research_memo>",
    memo,
    "</research_memo>",
    "",
    "위 조사 메모를 스키마에 맞게 정리해 주세요.",
  ].join("\n");
}
