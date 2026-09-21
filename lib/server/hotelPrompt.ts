import { HOTEL_GRADE_QUERY, HOTEL_PREFERENCES } from "@/lib/itemTypes";
import type { HotelRequest } from "@/lib/schemas/hotels";

/** 1단계: Google 검색으로 조사하는 요청 (자유 서술) */
export function buildHotelResearchPrompt(req: HotelRequest): string {
  const kind =
    req.lodgingType === "bnb"
      ? "아파트먼트·BnB 형태 숙소"
      : `${HOTEL_GRADE_QUERY[req.grade]} 호텔`;
  const wants = req.preferences
    .map((id) => HOTEL_PREFERENCES.find((p) => p.id === id)?.query)
    .filter(Boolean)
    .map((q) => `- ${q}`);

  return [
    `Google 검색 도구를 여러 번 사용해서, ${req.destination}의 ${kind} 4~5곳을 찾아 조사해 주세요.`,
    "검색으로 실제 존재가 확인된 숙소만 넣고, 기억에 의존해 이름이나 위치를 지어내지 마세요.",
    "",
    "원하는 조건:",
    ...(wants.length > 0 ? wants : ["- 특별한 조건 없음 (위치가 좋고 평이 안정적인 곳)"]),
    "",
    "숙소마다 아래 항목을 조사 메모로 정리해 주세요. 검색으로 확인하지 못한 항목은 '확인 못함'이라고 쓰세요.",
    "1. 정확한 상호 (영문 원문 + 한글 표기)와 등급",
    "2. 구/지역, 가장 가까운 지하철·기차역 이름과 그 역까지 도보 시간",
    `3. 예약 사이트(Booking.com, Agoda, Expedia 등)에서 확인한 1박 요금 범위 (${req.currency} 기준, 어느 사이트에서 확인했는지)`,
    "4. 한국어 후기·한국 언론 기사·한국인 여행 커뮤니티에서 한국인 이용이 확인되는지, 확인했다면 그 근거와 출처 사이트",
    "5. 위 조건을 얼마나 충족하는지, 추천 이유 한 줄",
    "",
    "서로 다른 지역과 가격대를 섞어 주세요.",
  ].join("\n");
}

export const HOTEL_STRUCTURE_SYSTEM_PROMPT = `당신은 숙소 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 내용만 사용합니다. 메모에 없는 숙소, 위치, 요금, 후기를 새로 만들지 않습니다.
- 메모에서 '확인 못함'이라고 한 항목은 비워 둡니다: 가까운 역이 확인되지 않았으면 nearestStation은 빈 문자열, walkMinutes는 0.
- priceBasis는 메모에서 예약 사이트 등으로 요금이 확인됐다고 한 경우에만 searched이고, 그렇지 않으면 estimated입니다. estimated인 경우 nightlyLow/nightlyHigh에는 메모의 대략적인 값(없으면 통상 시세)을 넣습니다.
- koreanFriendly는 메모가 한국인 이용을 근거와 함께 확인한 경우에만 true이고 근거를 koreanNote에 한 줄로 적습니다. 그렇지 않으면 false이고 koreanNote는 빈 문자열입니다.
- name은 메모의 정확한 상호(영문 원문, 한글 표기)입니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 2단계: 조사 메모를 JSON으로 정리하는 요청 */
export function buildHotelStructurePrompt(req: HotelRequest, memo: string): string {
  return [
    `요청 통화: ${req.currency} (nightlyLow, nightlyHigh는 1박 요금이며 이 통화 단위의 숫자)`,
    "",
    "<research_memo>",
    memo,
    "</research_memo>",
    "",
    "위 조사 메모를 스키마에 맞게 정리해 주세요.",
  ].join("\n");
}
