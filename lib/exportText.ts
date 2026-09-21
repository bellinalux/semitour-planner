import { compareWithCompetitors } from "@/lib/cost";
import { formatMoney } from "@/lib/currency";
import { formatDuration } from "@/lib/format";
import { pickPmOption, type PmChoice } from "@/lib/itinerary";
import type { CompetitorIncludes, DayPlan, ItineraryItem, QuoteData, TripInput, UspItem } from "@/types";

interface ExportData {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteData;
  usps: UspItem[];
}

const INCLUDE_LABELS: Record<keyof CompetitorIncludes, string> = {
  guide: "가이드",
  meals: "식사",
  admission: "입장료",
  vehicle: "차량",
};

const LINE = "────────────────────";

function includedLabels(includes: CompetitorIncludes, included: boolean): string[] {
  return (Object.keys(INCLUDE_LABELS) as (keyof CompetitorIncludes)[])
    .filter((k) => includes[k] === included)
    .map((k) => INCLUDE_LABELS[k]);
}

function itemLines(items: ItineraryItem[], detail: (item: ItineraryItem) => string): string[] {
  return items.flatMap((item, index) => {
    const lines = [`${index + 1}. ${item.name} ${detail(item)}`, `   ${item.description}`];
    if (item.travelMinutesToNext !== null) lines.push(`   ↓ 이동 ${formatDuration(item.travelMinutesToNext)}`);
    return lines;
  });
}

function dayBlocks(
  { days, pmChoice }: Pick<ExportData, "days" | "pmChoice">,
  detail: (item: ItineraryItem) => string,
  altNote: boolean,
): string[] {
  return days.flatMap((day) => {
    const pm = pickPmOption(day, pmChoice);
    const others = day.pmFreeOptions.filter((o) => o.id !== pm?.id);
    return [
      `[DAY ${day.day}] ${day.theme}`,
      "",
      "■ 오전 · 가이드 투어",
      ...itemLines(day.amGuided, detail),
      "",
      `■ 오후 · 반자유 일정 (코스 ${pm?.id}: ${pm?.title ?? ""})`,
      ...(pm ? itemLines(pm.items, detail) : []),
      ...(altNote && others.length > 0
        ? ["", `  (다른 오후 코스: ${others.map((o) => `${o.id} ${o.title}`).join(" / ")})`]
        : []),
      "",
    ];
  });
}

/** 내부용: 일정 + 원가/마진/인원별 견적 + 경쟁사 비교 + USP */
export function buildInternalText(data: ExportData): string {
  const { input, quote, usps } = data;
  const money = (v: number) => formatMoney(v, input.currency);
  const s = quote.scenario;

  const cost = (item: ItineraryItem) => {
    const parts = [`체류 ${formatDuration(item.stayMinutes)}`];
    if (item.entryFee > 0) parts.push(`입장료 ${money(item.entryFee)}`);
    if (item.mealCost > 0) parts.push(`식대 ${money(item.mealCost)}`);
    return `(${parts.join(" · ")})`;
  };

  const lines: string[] = [
    `[세미투어 견적서 — 내부용] ${input.destination}`,
    `${input.days}일 · ${quote.travelers}명 · 통화 ${input.currency}`,
    LINE,
    "",
    ...dayBlocks(data, cost, true),
    LINE,
    "■ 견적",
    ...quote.lines.filter((l) => l.amount > 0).map((l) => `${l.label}: ${money(l.amount)}${l.note ? ` (${l.note})` : ""}`),
    `총 원가: ${money(s.baseCost)} (1인 ${money(s.costPerPerson)})`,
    `카드 수수료: ${money(s.cardFee)}`,
    `예상 이익: ${money(s.profit)} (마진율 ${s.actualMarginRate.toFixed(1)}%)`,
    `▶ 최종 권장 판매가: 1인 ${money(s.pricePerPerson)} / 총 ${money(s.totalPrice)}`,
    "",
    "인원별 1인 권장가",
    ...quote.matrix.map((m) => `- ${m.travelers}명: ${money(m.pricePerPerson)} (이익률 ${m.actualMarginRate.toFixed(1)}%)`),
    `손익분기 최소 인원: ${quote.breakEvenTravelers === null ? "달성 불가" : `${quote.breakEvenTravelers}명`}`,
    `목표 마진 ${input.targetMarginRate}% 달성 최소 인원: ${quote.targetMarginTravelers === null ? "달성 불가" : `${quote.targetMarginTravelers}명`}`,
  ];

  if (input.competitors.length > 0) {
    const comparisons = compareWithCompetitors(input.competitors, s.pricePerPerson);
    lines.push("", LINE, "■ 경쟁사 비교");
    input.competitors.forEach((c, i) => {
      const cmp = comparisons[i];
      const name = c.name.trim() || `경쟁사 ${i + 1}`;
      const price = c.price > 0 ? money(c.price) : "가격 미입력";
      const diff =
        cmp.diff === null || cmp.diff === 0
          ? ""
          : cmp.diff > 0
            ? ` → 우리가 ${money(cmp.diff)} 저렴`
            : ` → 경쟁사가 ${money(-cmp.diff)} 저렴`;
      const inc = includedLabels(c.includes, true);
      lines.push(`- ${name}: ${price}${diff} / 포함: ${inc.length > 0 ? inc.join(", ") : "없음"}${c.note ? ` / ${c.note}` : ""}`);
    });
  }

  if (usps.length > 0) {
    lines.push("", LINE, "■ 세일즈 포인트 (경쟁사 대비 장점)");
    usps.forEach((u, i) => lines.push(`${i + 1}. ${u.title}`, `   ${u.reason}`));
  }

  return lines.join("\n").trim();
}

/** 고객용: 일정 + 판매가 + 포함/불포함. 원가, 마진, 경쟁사 정보는 넣지 않는다. */
export function buildCustomerText(data: ExportData): string {
  const { input, quote } = data;
  const money = (v: number) => formatMoney(v, input.currency);
  const s = quote.scenario;

  const stay = (item: ItineraryItem) => `(약 ${formatDuration(item.stayMinutes)})`;
  const included = includedLabels(quote.ourIncludes, true);
  const excluded = [...includedLabels(quote.ourIncludes, false), "저녁 식사(자유식)", "개인 경비"];

  return [
    `[${input.destination} ${input.days}일 세미투어]`,
    `${quote.travelers}명 기준 · 1인 ${money(s.pricePerPerson)} (총 ${money(s.totalPrice)})`,
    "오전에는 가이드와 함께, 오후에는 자유롭게 즐기는 세미투어입니다.",
    LINE,
    "",
    ...dayBlocks(data, stay, false),
    LINE,
    `■ 포함 사항: ${included.length > 0 ? included.join(", ") : "별도 안내"}`,
    `■ 불포함 사항: ${excluded.join(", ")}`,
    "※ 입장료와 식대 등은 현지 사정에 따라 변동될 수 있습니다.",
  ]
    .join("\n")
    .trim();
}
