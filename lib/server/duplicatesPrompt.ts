import type { FindDuplicatesRequest } from "@/lib/schemas/duplicates";

/** 웹 검색이 필요 없는 순수 텍스트 비교 작업이라 시스템 프롬프트 하나로 바로 구조화한다 */
export const DUPLICATE_SYSTEM_PROMPT = `당신은 여행 일정에서 중복된 코스를 찾아내는 편집자입니다.

[원칙]
- newItem이 candidates 중 정확히 같은 장소·코스를 가리키는 항목이 있으면 그 id를 duplicateIds에 넣습니다.
- 이름 표기가 다르거나(한글/영문, 약어) 설명 문구가 달라도 같은 장소·같은 체험이면 중복으로 봅니다.
- 같은 장소라도 시간대나 체험 성격이 다르면 중복이 아닙니다. 특히 낮투어와 야경투어, 실내 관람과 야외 산책, 가이드 동행과 자유 관람처럼 명백히 다른 상품이면 중복에 넣지 않습니다.
- 애매하면(확신이 없으면) 중복에 넣지 않습니다. 잘못 지워서 고객이 볼 코스가 사라지는 것이 더 큰 문제입니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

export function buildDuplicateUserPrompt(req: FindDuplicatesRequest): string {
  return [
    "<new_item>",
    `id: ${req.newItem.id}`,
    `이름: ${req.newItem.name}`,
    `설명: ${req.newItem.description || "(없음)"}`,
    "</new_item>",
    "",
    "<candidates>",
    ...req.candidates.map((c) => `- id: ${c.id} | 이름: ${c.name} | 설명: ${c.description || "(없음)"}`),
    "</candidates>",
    "",
    "new_item이 candidates 중 중복되는 항목이 있는지 찾아 주세요.",
  ].join("\n");
}
