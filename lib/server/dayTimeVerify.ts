import { roundMinutes } from "@/lib/format";
import { dayTimeResultSchema, type DayTimeArea, type DayTimeDayResult, type DayTimeRequest, type DayTimeResponse } from "@/lib/schemas/dayTime";
import { cached, DAY } from "./aiCache";
import { generateGroundedText, generateJson } from "./gemini";

/** 이동·숙소·항공은 구역으로 묶지 않는다 (방문 장소만) */
const NOT_A_PLACE = new Set(["flight", "transfer", "hotel"]);

function researchPrompt(destination: string, day: DayTimeRequest["days"][number]): string {
  const lines = day.items.map((i) => `- [${i.id}] ${i.name} (${i.type || "sightseeing"}${NOT_A_PLACE.has(i.type) ? ", 구역에 넣지 않음" : ""})`);
  return [
    `Google 검색 도구를 여러 번 사용해서, ${day.city || destination} 하루 일정의 실제 소요 시간을 확인해 주세요. 아래는 방문 순서입니다.`,
    "",
    ...lines,
    "",
    "장소를 하나씩 따로 방문하는 시간이 아니라, 이 순서대로 하루를 돌 때의 현실적인 시간을 찾습니다.",
    "하나투어·모두투어·노랑풍선 같은 국내 여행사, Klook·Viator·KKday 투어 일정표, 관광청 추천 코스, 여행 후기에서 이 장소들을 묶어 몇 시간에 도는지를 찾아 근거로 삼으세요.",
    "",
    "조사 메모에 아래를 적어 주세요 (대괄호 안 항목 ID를 그대로):",
    "1. 걸어서 함께 둘러보는 장소끼리 묶은 '구역' — 방문 순서를 지키고, 서로 붙어 있는 항목만 묶습니다 (예: 마카오 반도 역사지구 = 탑석광장~세나도 광장).",
    "   항공·이동·호텔 항목은 어느 구역에도 넣지 않습니다. 식사·카페는 그 구역 안에 있으면 구역에 넣습니다.",
    "2. 구역마다 관광객이 보통 쓰는 총 시간(분) — 구역 안 도보 이동은 포함하고, 점심·저녁 식사 시간은 뺍니다.",
    "3. 구역 안 장소 사이 보통 도보 시간(분)",
    "4. 그 구역 마지막 장소에서 다음 항목까지 이동 수단과 시간(분) (예: 택시 15~20분)",
    "5. 구역마다 속한 큰 지역 (예: 마카오 반도 / 타이파 / 코타이 / 콜로안 — 같은 지역이면 같은 이름으로)",
    "   차량이 못 들어가는 걷기 구역이면 단체 차량이 내려 주는 곳과, 다 걸은 뒤 차량이 기다리는 곳 (한 방향으로 걷고 차량이 반대편에서 기다리는 방식, 언덕이면 내리막 방향)",
    "6. 근거 출처 이름",
    "확인하지 못한 값은 '확인 못함'이라고 쓰세요. 기억이나 추측으로 시간을 만들지 마세요.",
  ].join("\n");
}

const SYSTEM = `당신은 하루 일정 소요 시간 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 메모에 있는 구역·시간만 씁니다. 메모에 없는 시간을 만들지 않습니다.
- itemIds에는 메모의 항목 ID를 요청 순서대로, 서로 붙어 있는 항목만 넣습니다. 항공·이동·호텔 항목은 넣지 않습니다. 한 항목은 한 구역에만 넣습니다.
- 시간이 범위(예: 3~4시간)면 중간값을 분으로 씁니다. '확인 못함'이면 0입니다.
- 장소가 하나뿐인 구역도 됩니다. 메모가 묶지 않은 장소는 넣지 않아도 됩니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 하루 한 번: 1단계 검색으로 조사, 2단계 JSON 정리. 요청 항목 ID가 아닌 것은 버린다 */
async function verifyDay(
  destination: string,
  day: DayTimeRequest["days"][number],
): Promise<{ result: DayTimeDayResult; sources: { title: string; url: string }[] }> {
  const research = await generateGroundedText({ user: researchPrompt(destination, day), fast: true });
  if (!research.searched) return { result: { day: day.day, areas: [], searched: false }, sources: [] };
  const structured = await generateJson({
    fast: true,
    system: SYSTEM,
    user: `<조사 메모>\n${research.text}\n</조사 메모>\n\n요청 항목 ID: ${day.items.map((i) => i.id).join(", ")}`,
    schema: dayTimeResultSchema,
    temperature: 0.1,
  });
  const valid = new Set(day.items.filter((i) => !NOT_A_PLACE.has(i.type)).map((i) => i.id));
  const used = new Set<string>();
  const areas: DayTimeArea[] = structured.areas
    .map((a) => {
      const itemIds = a.itemIds.filter((id) => valid.has(id) && !used.has(id));
      itemIds.forEach((id) => used.add(id));
      return {
        name: a.name.trim().slice(0, 60),
        region: a.region.trim().slice(0, 40),
        dropOff: a.dropOff.trim().slice(0, 60),
        pickUp: a.pickUp.trim().slice(0, 60),
        itemIds,
        totalMinutes: roundMinutes(Math.max(0, a.totalMinutes)),
        walkMinutes: Math.max(0, Math.min(60, Math.round(a.walkMinutes))),
        travelToNextMinutes: Math.max(0, Math.min(240, Math.round(a.travelToNextMinutes))),
        sourceName: a.sourceName.trim().slice(0, 80),
      };
    })
    .filter((a) => a.itemIds.length > 0 && a.totalMinutes > 0);
  return { result: { day: day.day, areas, searched: true }, sources: research.sources };
}

export async function verifyDayTimes(req: DayTimeRequest): Promise<DayTimeResponse> {
  const out = await Promise.all(
    req.days.map((day) =>
      // 같은 항목·순서면 7일 동안 다시 쓴다 (검색 근거가 있고 구역을 찾은 결과만). 결과가 항목 ID를 쓰므로 키에도 ID를 넣는다
      cached(
        "day-time-v3",
        { destination: req.destination, city: day.city, items: day.items.map((i) => [i.id, i.name, i.type]) },
        7 * DAY,
        () => verifyDay(req.destination, day),
        (r) => r.result.searched && r.result.areas.length > 0,
      ).then((r) => ({ ...r, result: { ...r.result, day: day.day } })),
    ),
  );
  return {
    days: out.map((o) => o.result),
    sources: out.flatMap((o) => o.sources).slice(0, 8),
    checkedAt: new Date().toISOString(),
  };
}
