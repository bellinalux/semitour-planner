import { groundPlan, tierOfLabel, VEHICLE_TIERS, type VehicleTier } from "@/lib/groundPlan";
import { citiesOf } from "@/lib/knowledge";
import { addGround, pickRate, type CityRates } from "@/lib/rateBook";
import {
  groundTierResearchSchema, TIER_IDS, type GroundLookupRequest, type GroundLookupResponse, type GroundTierResearch, type RateRange,
} from "@/lib/schemas/groundLookup";
import { cached, DAY } from "./aiCache";
import { generateGroundedText, generateJson } from "./gemini";
import { getRates, updateRates } from "./rateStore";

const NONE: RateRange = { low: 0, mid: 0, high: 0, source: "none", basis: "" };

function researchPrompt(req: GroundLookupRequest): string {
  const domestic = req.tripScope === "domestic";
  const guide = domestic ? "외국인 관광객을 안내하는 외국어(영어 등) 가이드" : "한국어 가이드";
  return [
    `Google 검색 도구를 여러 번 사용해서, ${req.destination}에서 단체 관광 투어를 운영할 때 드는 전세 차량과 가이드 요금을 조사해 주세요.`,
    "차종마다 기사·유류비 포함 1대 1일(약 8~10시간) 대절 요금의 낮은 쪽·보통·높은 쪽을 찾으세요:",
    "  - 승용차·SUV (4인승)",
    "  - 7인승 SUV·MPV",
    "  - 미니밴 (15~16인승)",
    "  - 중형버스 (25~29인승)",
    "  - 대형버스 (45인승)",
    `${guide} 1명 1일(약 8시간) 요금의 낮은 쪽·보통·높은 쪽도 찾으세요.`,
    domestic
      ? "국내 전세버스는 국토교통부 전세버스 운임 기준·전세버스 업체 견적, 기사 일비·숙박비 관행도 확인하세요."
      : "현지 차량 렌트 업체·여행사(랜드사) 견적 사례·가이드 예약 사이트·여행 커뮤니티 후기를 참고하세요.",
    "찾은 금액의 통화와 조건(시간, 포함·불포함)을 함께 적고, 확인하지 못한 항목은 '확인 못함'이라고 쓰세요.",
  ].join("\n");
}

const SYSTEM = `당신은 여행사 지상비(전세 차량·가이드) 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 금액만 근거로 씁니다. 다른 통화면 요청 통화로 대략 환산합니다.
- 차종마다 1대 1일 요금입니다(여러 대 합계가 아님). 가이드는 1명 1일 요금입니다.
- 하나만 찾았으면 low·typical·high를 같은 값으로, '확인 못함'이면 모두 0입니다.
- 한국어로, 지정된 JSON 스키마의 JSON만 출력합니다.`;

async function research(req: GroundLookupRequest): Promise<{ data: GroundTierResearch | null; sources: { title: string; url: string }[]; searched: boolean }> {
  const memo = await generateGroundedText({ user: researchPrompt(req), fast: true });
  if (!memo.searched) return { data: null, sources: [], searched: false };
  const data = await generateJson({
    fast: true,
    system: SYSTEM,
    user: ["<research_memo>", memo.text, "</research_memo>", "", `요청 통화: ${req.currency}`, "", "위 메모를 스키마에 맞게 정리해 주세요."].join("\n"),
    schema: groundTierResearchSchema,
    temperature: 0,
  });
  return { data, sources: memo.sources.slice(0, 8), searched: true };
}

function fromWeb(r: { low: number; typical: number; high: number } | undefined): RateRange {
  if (!r) return NONE;
  const vals = [r.low, r.typical, r.high].map((v) => Math.max(0, Math.round(v))).filter((v) => v > 0);
  if (!vals.length) return NONE;
  const mid = r.typical > 0 ? Math.round(r.typical) : Math.round((Math.min(...vals) + Math.max(...vals)) / 2);
  return { low: Math.min(...vals), mid, high: Math.max(...vals), source: "web", basis: "웹 시세" };
}

/** 회사 요금표에서 차종·가이드 요금 고르기 (업체 견적가 180일·같은 시즌 > 웹 시세 30일) */
function fromBook(book: CityRates | null, req: GroundLookupRequest) {
  const tiers: Partial<Record<VehicleTier, RateRange>> = {};
  let guide: (RateRange & { label: string }) | null = null;
  for (const card of book?.ground ?? []) {
    const p = pickRate(card.rates, req.currency, req.month);
    if (!p) continue;
    const range: RateRange = { low: p.low, mid: p.mid, high: p.high, source: p.obs.source === "supplier" ? "book-supplier" : "book-web", basis: `회사 요금표 — ${card.label} · ${p.basis}` };
    const better = (cur: RateRange | null | undefined) => !cur || (cur.source !== "book-supplier" && range.source === "book-supplier");
    if (card.kind === "vehicle") {
      const tier = tierOfLabel(card.label);
      if (tier && better(tiers[tier])) tiers[tier] = range;
    } else {
      // 해외면 한국어 가이드, 국내면 외국어 가이드 카드를 먼저
      const wanted = req.tripScope === "domestic" ? !/한국어/.test(card.label) : /한국어|korean/i.test(card.label);
      if (better(guide) && (wanted || !guide)) guide = { ...range, label: card.label };
    }
  }
  return { tiers, guide };
}

export async function lookupGround(req: GroundLookupRequest): Promise<GroundLookupResponse> {
  const plan = groundPlan(req.travelers, req.guideCapacity);
  const city = citiesOf(req.destination)[0] ?? req.destination;
  const book = await getRates(city).catch(() => null);
  const fromRates = fromBook(book, req);

  // 요금표에 지금 차종과 가이드가 다 있으면 웹은 찾지 않는다 (다른 차종은 기본 비율로 환산)
  const needWeb = req.refresh || !fromRates.tiers[plan.tier] || !fromRates.guide;
  const web = needWeb
    ? await cached("ground-tiers-v1", { ...req, refresh: false, travelers: 0, guideCapacity: 0, month: 0 }, 7 * DAY, () => research(req), (r) => r.searched)
    : null;

  const tiers = Object.fromEntries(
    TIER_IDS.map((t) => [t, (!req.refresh && fromRates.tiers[t]) || (web?.data ? fromWeb(web.data[t]) : NONE)]),
  ) as GroundLookupResponse["tiers"];
  // 새로 찾기(refresh)여도 웹에 없으면 요금표 값을 쓴다
  for (const t of TIER_IDS) if (tiers[t].source === "none" && fromRates.tiers[t]) tiers[t] = fromRates.tiers[t]!;
  const webGuide = web?.data ? fromWeb(web.data.guide) : NONE;
  const guideLabel = req.tripScope === "domestic" ? "외국어 가이드" : "한국어 가이드";
  const guide = (!req.refresh && fromRates.guide) || (webGuide.source !== "none" ? { ...webGuide, label: guideLabel } : fromRates.guide ?? { ...NONE, label: guideLabel });

  // 웹 시세는 요금표에 쌓는다 (다음 조회는 요금표부터)
  if (web?.data) {
    const at = new Date().toISOString();
    const data = web.data;
    await updateRates(city, (d) => {
      let doc = d;
      for (const t of TIER_IDS) {
        const r = fromWeb(data[t]);
        if (r.source === "web") doc = addGround(doc, "vehicle", VEHICLE_TIERS.find((v) => v.id === t)!.label, { at, month: 0, low: r.low, high: r.high, currency: req.currency, source: "web", by: "웹 시세", note: data.vehicleConditions });
      }
      if (webGuide.source === "web") doc = addGround(doc, "guide", guideLabel, { at, month: 0, low: webGuide.low, high: webGuide.high, currency: req.currency, source: "web", by: "웹 시세", note: data.guideConditions });
      return doc;
    }).catch(() => null);
  }

  return {
    travelers: plan.travelers,
    plan: { tier: plan.tier, tierLabel: plan.tierLabel, count: plan.count, guides: plan.guides, label: plan.label },
    tiers,
    guide,
    vehicleConditions: web?.data?.vehicleConditions?.trim() ?? "",
    guideConditions: web?.data?.guideConditions?.trim() ?? "",
    searched: web?.searched ?? false,
    usedWeb: needWeb,
    sources: web?.sources ?? [],
  };
}
