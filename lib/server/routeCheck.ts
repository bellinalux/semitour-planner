import type { RouteCheckRequest, RouteCheckResponse } from "@/lib/schemas/routeCheck";
import { routeCheckResultSchema } from "@/lib/schemas/routeCheck";
import { generateGroundedText, generateJson } from "./gemini";

function researchPrompt(req: RouteCheckRequest): string {
  const lines = req.items.map((item, i) => `${i + 1}. [${item.id}] ${item.name}`);
  return [
    `Google 검색 도구를 여러 번 사용해서, ${req.destination}${req.city ? ` ${req.city}` : ""}에 있는 아래 장소들의 실제 위치(주소·구역·동네)를 확인해 주세요.`,
    "",
    "현재 방문 순서 (앞 숫자가 방문 순서, 대괄호 안이 항목 ID입니다. 메모에 ID를 그대로 적어 주세요):",
    ...lines,
    "",
    "장소마다 위치한 구역·동네나 주소를 조사한 뒤, 이 순서 그대로 다니면 도보·차량 이동이 비효율적으로 왔다갔다하는 지그재그 동선인지 판단해 주세요.",
    "예를 들어 1번과 3번 장소가 서로 가깝거나 같은 방향인데 2번이 반대 방향이라 순서대로 가면 왕복하게 된다면 비효율적인 동선입니다.",
    "비효율적이라고 판단되면, 같은 장소들을 모두 포함하면서 지리적으로 더 자연스럽게 이어지는 방문 순서를 제안해 주세요.",
    "위치를 확인하지 못한 장소가 있으면 그 장소는 언급하고, 확인된 장소만으로 판단하세요.",
  ].join("\n");
}

const SYSTEM = `당신은 여행 동선을 검토하는 편집자입니다.

[원칙]
- 조사 메모에서 확인한 위치 관계만 근거로 판단합니다. 확인하지 못한 위치는 추측하지 않습니다.
- isZigzag는 조사한 위치 관계상 방문 순서가 분명히 비효율적일 때만 true로 합니다. 애매하거나 위치를 확인하지 못했으면 false로 둡니다(잘못된 변경 제안보다 그대로 두는 것이 안전합니다).
- suggestedOrder는 isZigzag가 true일 때만 채우고, 요청받은 항목 id를 빠짐없이 모두 포함한 새 순서로 씁니다. isZigzag가 false면 빈 배열입니다.
- reason은 한두 문장으로, 확인한 위치 관계를 구체적으로 근거로 씁니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 하루(또는 한 세션)의 방문 순서가 지그재그로 비효율적인지 웹 검색으로 확인하고, 필요하면 더 나은 순서를 제안한다. */
export async function checkRoute(req: RouteCheckRequest): Promise<RouteCheckResponse> {
  const research = await generateGroundedText({ user: researchPrompt(req) });
  // 검색 근거가 없으면 위치 관계를 믿을 수 없으므로 "비효율적"이라고 함부로 판단하지 않는다
  if (!research.searched) {
    return { isZigzag: false, reason: "웹 검색 근거를 확보하지 못해 동선을 확인하지 못했습니다.", suggestedOrder: [], sources: [], searched: false };
  }

  const structured = await generateJson({
    system: SYSTEM,
    user: [
      "<research_memo>",
      research.text,
      "</research_memo>",
      "",
      `요청 항목 ID: ${req.items.map((i) => i.id).join(", ")}`,
      "",
      "위 메모를 스키마에 맞게 정리해 주세요.",
    ].join("\n"),
    schema: routeCheckResultSchema,
    temperature: 0,
  });

  const validIds = new Set(req.items.map((i) => i.id));
  const suggested = structured.suggestedOrder.filter((id) => validIds.has(id));
  // 제안한 순서가 원래 항목을 빠짐없이 포함해야만(중복 없이 전부) 신뢰할 수 있는 제안으로 본다
  const complete = suggested.length === req.items.length && new Set(suggested).size === req.items.length;

  return {
    isZigzag: structured.isZigzag && complete,
    reason: structured.reason.trim() || (structured.isZigzag ? "위치 관계상 이동이 비효율적입니다." : "현재 순서가 대체로 자연스럽습니다."),
    suggestedOrder: structured.isZigzag && complete ? suggested : [],
    sources: research.sources.slice(0, 8),
    searched: true,
  };
}
