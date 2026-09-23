import type { FlightOptionsRequest } from "@/lib/schemas/flightOptions";

/** 1단계: Google 검색으로 개별 항공편을 여러 개 조사하는 요청 (자유 서술) */
export function buildFlightOptionsResearchPrompt(req: FlightOptionsRequest): string {
  const when = req.departureDate.trim() ? `${req.departureDate.trim()} 출발 기준` : "앞으로 1~2개월 내 가까운 시일 기준";
  return [
    `Google 검색 도구를 여러 번 사용해서, "${req.origin} → ${req.destination}" 왕복 항공권(이코노미, 성인 1인, ${when}, ${req.days - 1}박 ${req.days}일 일정)을 실제로 검색되는 편으로 5~8개 찾아 주세요.`,
    "네이버 항공권, Google Flights, 스카이스캐너, 카약, 인터파크투어 항공 등 항공권 검색 결과 페이지에 실제로 나열된 개별 항공편을 조사 대상으로 합니다. 기억에 의존해 편명이나 시간을 지어내지 마세요.",
    "직항과 경유를 섞어서, 그리고 항공사가 여러 곳이면 골고루 찾아 주세요.",
    "",
    "항공편마다 가는 편과 귀국편(돌아오는 편)을 모두 아래처럼 조사 메모로 정리하세요. 확인하지 못한 항목은 '확인 못함'이라고 쓰세요.",
    "[가는 편]",
    "1. 항공사, 편명",
    "2. 출발일, 출발 공항(코드 포함), 출발 시각",
    "3. 도착 공항(코드 포함), 도착 시각",
    "4. 경유 횟수(직항이면 직항이라고 명시), 총 비행시간(경유 대기 포함)",
    "[귀국편]",
    "5. 편명(가는 편과 같은 항공사인 경우가 많지만 다를 수 있으니 확인)",
    "6. 출발일, 출발 공항(코드 포함), 출발 시각",
    "7. 도착 공항(코드 포함), 도착 시각 (다음날 새벽 도착이면 그렇게 표기)",
    "8. 경유 횟수, 총 비행시간",
    "[공통]",
    "9. 왕복 1인 요금(이코노미, 세금·유류할증료 포함 여부도 적기)",
    "10. 요금을 확인한 사이트 이름과, 그 항공편을 다시 찾아볼 수 있는 URL",
  ].join("\n");
}

export const FLIGHT_OPTIONS_STRUCTURE_SYSTEM_PROMPT = `당신은 항공편 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 항공편만 사용합니다. 메모에 없는 편명·시간·요금을 새로 만들지 않습니다.
- 메모에서 '확인 못함'이라고 한 항목은 비워 둡니다(문자열은 빈 문자열, 숫자는 0).
- basis는 메모가 검색 결과 페이지에서 실제로 확인했다고 한 항공편만 searched이고, 그렇지 않으면 estimated입니다.
- stops·returnStops는 직항이면 0, 경유 1회면 1입니다. 메모에 명시가 없으면 0으로 두지 말고 실제 조사된 값을 씁니다(불확실하면 그 항공편은 결과에서 뺍니다).
- 귀국편(return* 필드)은 메모의 [귀국편] 항목을 그대로 옮깁니다. 메모에 귀국편 정보가 없으면 모두 빈 문자열/0으로 둡니다.
- link는 메모에 적힌 URL을 그대로 옮깁니다. 없으면 빈 문자열로 둡니다(호출한 쪽에서 대체 링크를 넣습니다).
- 같은 항공편을 중복해서 넣지 않습니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 2단계: 조사 메모를 JSON으로 정리하는 요청 */
export function buildFlightOptionsStructurePrompt(req: FlightOptionsRequest, memo: string): string {
  return [
    `요청 통화: ${req.currency} (price는 1인 왕복 요금이며 이 통화 단위의 숫자)`,
    `노선: ${req.origin} → ${req.destination}`,
    "",
    "<research_memo>",
    memo,
    "</research_memo>",
    "",
    "위 조사 메모를 스키마에 맞게 정리해 주세요.",
  ].join("\n");
}
