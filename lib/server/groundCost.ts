import type { GroundCostRequest, GroundCostResponse } from "@/lib/schemas/groundCost";
import { groundCostResultSchema } from "@/lib/schemas/groundCost";
import { generateGroundedText, generateJson } from "./gemini";

function researchPrompt(req: GroundCostRequest): string {
  const guide = req.tripScope === "domestic" ? "외국인 관광객을 안내하는 외국어(영어 등) 가이드" : "한국어 가이드";
  return [
    `Google 검색 도구를 여러 번 사용해서, ${req.destination}에서 ${req.travelers}명 단체 투어를 운영할 때 드는 현지 비용을 조사해 주세요.`,
    `1. ${req.vehicleClass ? `${req.vehicleClass} ` : "인원에 맞는 "}전용 차량(기사·유류비 포함) 1일(약 8~10시간) 대절 요금`,
    `2. ${guide} 1일(약 8시간) 요금`,
    "현지 차량 렌트 업체·가이드 예약 사이트·여행사 견적 사례·여행 커뮤니티 후기를 참고하고, 찾은 금액과 통화, 조건(차종, 시간)을 정리하세요.",
    "확인하지 못한 항목은 '확인 못함'이라고 쓰세요.",
  ].join("\n");
}

const SYSTEM = `당신은 여행사 지상비(차량·가이드) 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 금액만 근거로 씁니다. 메모의 금액이 다른 통화면 요청 통화로 대략 환산합니다.
- 여러 금액이 있으면 인원에 맞는 일반적인 값을 고릅니다. '확인 못함'이면 0입니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 현지 차량·가이드 1일 요금을 웹 검색으로 추정한다. 검색 근거가 없으면 0으로 돌려 함부로 채우지 않는다. */
export async function estimateGroundCost(req: GroundCostRequest): Promise<GroundCostResponse> {
  const research = await generateGroundedText({ user: researchPrompt(req), fast: true });
  if (!research.searched) {
    return { vehicleCostPerDay: 0, guideCostPerDay: 0, vehicleNote: "", guideNote: "", searched: false, sources: [] };
  }
  const result = await generateJson({
    fast: true,
    system: SYSTEM,
    user: ["<research_memo>", research.text, "</research_memo>", "", `요청 통화: ${req.currency}`, `인원: ${req.travelers}명`, "", "위 메모를 스키마에 맞게 정리해 주세요."].join("\n"),
    schema: groundCostResultSchema,
    temperature: 0,
  });
  return {
    vehicleCostPerDay: Math.max(0, Math.round(result.vehicleCostPerDay)),
    guideCostPerDay: Math.max(0, Math.round(result.guideCostPerDay)),
    vehicleNote: result.vehicleNote.trim(),
    guideNote: result.guideNote.trim(),
    searched: true,
    sources: research.sources.slice(0, 6),
  };
}
