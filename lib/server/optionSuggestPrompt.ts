import type { SuggestOptionsRequest } from "@/lib/schemas/optionSuggest";

/** 1단계: Google 검색으로 코스별 선택 옵션을 조사하는 요청 (자유 서술) */
export function buildOptionSuggestResearchPrompt(req: SuggestOptionsRequest): string {
  const lines = req.items.map(
    (item) => `- [${item.id}] ${item.name}${item.city ? ` (${item.city})` : ""}${item.description ? ` — ${item.description}` : ""}`,
  );
  return [
    `Google 검색 도구를 여러 번 사용해서, ${req.destination} 여행 일정에 들어가는 아래 코스마다 "그 장소·주변에서 실제로 판매되는 선택형 현지 액티비티(옵션)"를 조사해 주세요.`,
    "예: 해변·부두 근처면 바나나보트·제트스키(수상스키)·수상택시·패러세일링·스노클링, 도심이면 쿠킹 클래스·전통 공연·마사지, 자연 명소면 짚라인·래프팅처럼 — 그 코스의 성격과 위치에 실제로 맞는 옵션만 찾습니다. 코스와 무관한 옵션(예: 박물관 코스에 바나나보트)은 억지로 넣지 마세요.",
    "대형 여행사(하나투어, 모두투어 등)의 자유일정 옵션 안내, 예약 플랫폼(Klook, GetYourGuide, Viator, 마이리얼트립, 와그, 케이케이데이 등), 현지 투어 업체 공식 사이트를 우선 참고하고, 기억이나 추측으로 상품명·요금을 지어내지 마세요.",
    "",
    "확인할 코스 (대괄호 안이 코스 ID입니다. 메모에 ID를 그대로 적어 주세요):",
    ...lines,
    "",
    "코스마다 실제로 판매되는 옵션을 최대 3개까지 찾아 아래를 조사 메모로 정리하세요. 그 코스에 어울리는 옵션을 찾지 못했으면 억지로 만들지 말고 '해당 없음'이라고 쓰세요. 확인하지 못한 항목은 '확인 못함'이라고 쓰세요.",
    "1. 코스 ID",
    "2. 옵션 이름과 무엇을 하는지 1문장",
    "3. 현지 통화(ISO 4217 코드)로 된 외국인(관광객) 성인 1인 요금",
    "4. 요금을 확인한 사이트·업체 이름",
    "5. 예약 필요 여부, 최소 인원, 운영 시기 등 유의사항 한 줄",
  ].join("\n");
}

export const OPTION_SUGGEST_STRUCTURE_SYSTEM_PROMPT = `당신은 코스별 선택 옵션 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 옵션만 사용합니다. 메모에 없는 옵션, 요금, 업체명을 새로 만들지 않습니다.
- 코스마다 메모에 적힌 코스 ID를 id에 그대로 씁니다. 요청한 모든 코스가 결과에 있어야 하며, 메모가 '해당 없음'이라고 한 코스는 options를 빈 배열로 둡니다.
- status: 메모가 요금을 근거와 함께 확인했으면 confirmed, '확인 못함'이거나 근거가 없으면 unverified.
- confirmed: localCurrency는 요금의 통화(ISO 4217 3글자 대문자), localAmount는 외국인 성인 1인 금액(숫자). unverified면 localAmount는 0이고 localCurrency는 비워도 됩니다.
- sourceName은 메모에 적힌 확인 사이트·업체 이름(없으면 빈 문자열), note는 유의사항 한 줄(없으면 빈 문자열)입니다.
- 한 코스에 옵션이 여럿이면 최대 3개까지만 남기고, 성격이 겹치면(예: 바나나보트와 튜빙처럼 비슷한 수상 액티비티) 대표적인 것 위주로 추립니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 2단계: 조사 메모를 JSON으로 정리하는 요청 */
export function buildOptionSuggestStructurePrompt(req: SuggestOptionsRequest, memo: string): string {
  return [
    "<research_memo>",
    memo,
    "</research_memo>",
    "",
    `요청 코스 ID: ${req.items.map((i) => i.id).join(", ")}`,
    "",
    "위 메모를 스키마에 맞게 정리해 주세요.",
  ].join("\n");
}
