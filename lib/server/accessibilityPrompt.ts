import type { VerifyAccessibilityRequest } from "@/lib/schemas/accessibility";

/** 1단계: Google 검색으로 이용 편의시설을 재조사하는 요청 (자유 서술) */
export function buildAccessibilityResearchPrompt(req: VerifyAccessibilityRequest): string {
  const lines = req.items.map((item) => `- [${item.id}] ${item.name}${item.city ? ` (${item.city})` : ""}`);
  return [
    `Google 검색 도구를 여러 번 사용해서, ${req.destination} 여행 일정에 들어가는 아래 장소들의 휠체어·거동불편 여행자 이용 편의시설을 정확히 조사해 주세요.`,
    "공식 홈페이지의 이용 안내, 배리어프리(barrier-free)·무장애 여행 정보 사이트, 지자체·관광청 관광 접근성 안내를 우선 참고하고, 기억이나 추측으로 답하지 마세요.",
    "",
    "확인할 장소 (대괄호 안이 장소 ID입니다. 메모에 ID를 그대로 적어 주세요):",
    ...lines,
    "",
    "장소마다 아래를 조사 메모로 정리하세요. 검색으로 확인하지 못한 항목은 '확인 못함'이라고 쓰세요.",
    "1. 장소 ID와 이름",
    "2. 휠체어로 입장·이용이 가능한지",
    "3. 장애인 화장실이 있는지",
    "4. 엘리베이터가 있는지 (건물/전망대 등 층 이동이 있는 경우)",
    "5. 경사로(램프)가 있는지, 계단만 있는 구간이 있는지",
    "6. 전체적으로 휠체어·거동불편 여행자에게 무리 없는 곳인지(ok), 일부 구간만 어려운지(limited), 이용이 사실상 어려운지(difficult)",
  ].join("\n");
}

export const ACCESSIBILITY_STRUCTURE_SYSTEM_PROMPT = `당신은 이용 편의시설 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 내용만 사용합니다. 메모에 없는 사실을 새로 만들지 않습니다.
- 장소마다 메모에 적힌 장소 ID를 id에 그대로 씁니다. 요청한 모든 장소가 결과에 있어야 합니다.
- 메모가 '확인 못함'이라고 했거나 조사 자체가 안 된 장소는 level을 unknown으로 하고, wheelchairAccessible·accessibleRestroom·elevator·ramp는 모두 false로 둡니다. note는 빈 문자열입니다.
- level이 unknown이 아니려면 실제로 조사된 근거가 있어야 합니다(추측 금지).
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 2단계: 조사 메모를 JSON으로 정리하는 요청 */
export function buildAccessibilityStructurePrompt(req: VerifyAccessibilityRequest, memo: string): string {
  return [
    "<research_memo>",
    memo,
    "</research_memo>",
    "",
    `요청 장소 ID: ${req.items.map((i) => i.id).join(", ")}`,
    "",
    "위 메모를 스키마에 맞게 정리해 주세요.",
  ].join("\n");
}
