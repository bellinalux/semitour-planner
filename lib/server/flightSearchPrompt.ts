import type { FlightWebRequest } from "@/lib/schemas/flightSearch";

/** 1단계: Google 검색으로 항공 요금을 조사하는 요청 (자유 서술) */
export function buildFlightResearchPrompt(req: FlightWebRequest): string {
  return [
    `Google 검색 도구를 여러 번 사용해서, "${req.origin} → ${req.destination}" 왕복 항공권(이코노미, 성인 1인, ${req.days - 1}박 ${req.days}일 일정)의 실제 요금을 조사해 주세요.`,
    "네이버 항공권, Google Flights, 스카이스캐너, 카약, 인터파크투어 항공 등 항공권 가격비교 사이트의 검색 결과 페이지에 실제로 표시된 요금을 찾으세요.",
    "기억에 의존해 요금을 지어내지 말고, 검색으로 확인한 범위만 적으세요. 확인하지 못했으면 '확인 못함'이라고 쓰세요.",
    "",
    "아래 항목을 조사 메모로 정리해 주세요.",
    "1. 왕복 이코노미 1인 요금 범위 (최저가~평균가, 세금·유류할증료 포함인지도 적기)",
    `2. 요금을 확인한 사이트 이름`,
    "3. 직항 노선이 있는지, 주로 어느 항공사가 다니는지",
    "4. 저렴한 시기나 요일 경향 (검색 결과에 나온 경우에만)",
    "5. 요금 관련 유의사항 (유류할증료 별도 여부, 경유 포함 최저가인지 등)",
  ].join("\n");
}

export const FLIGHT_STRUCTURE_SYSTEM_PROMPT = `당신은 항공 요금 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 내용만 사용합니다. 메모에 없는 금액이나 사실을 새로 만들지 않습니다.
- 메모에서 '확인 못함'이라고 한 항목은 비워 둡니다: 문자열은 빈 문자열, 요금은 0.
- basis는 메모가 검색 결과 페이지에서 실제 요금을 확인했다고 한 경우에만 searched이고, 그렇지 않으면 estimated입니다. estimated이면 roundTripLow/High에는 메모에 적힌 대략적인 값(없으면 통상 시세)을 넣습니다.
- 요금은 1인 왕복 기준 숫자만 넣고 통화 기호나 쉼표는 넣지 않습니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 2단계: 조사 메모를 JSON으로 정리하는 요청 */
export function buildFlightStructurePrompt(req: FlightWebRequest, memo: string): string {
  return [
    `요청 통화: ${req.currency} (roundTripLow, roundTripHigh는 1인 왕복 요금이며 이 통화 단위의 숫자)`,
    `노선: ${req.origin} → ${req.destination}`,
    "",
    "<research_memo>",
    memo,
    "</research_memo>",
    "",
    "위 조사 메모를 스키마에 맞게 정리해 주세요.",
  ].join("\n");
}
