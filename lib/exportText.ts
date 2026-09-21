import { compareWithCompetitors } from "@/lib/cost";
import { formatMoney } from "@/lib/currency";
import { formatDuration } from "@/lib/format";
import { ITEM_TYPE_META } from "@/lib/itemTypes";
import { pickPmOption, type PmChoice } from "@/lib/itinerary";
import type {
  CompetitorIncludes,
  CourseMeta,
  DayPlan,
  ItineraryItem,
  QuoteData,
  TripInput,
  UspItem,
} from "@/types";

interface ExportData {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteData;
  usps: UspItem[];
  meta: CourseMeta | null;
}

const INCLUDE_LABELS: Record<keyof CompetitorIncludes, string> = {
  guide: "가이드",
  meals: "식사",
  admission: "입장료",
  vehicle: "차량",
  hotel: "숙박",
  flight: "항공",
};

const PACKAGE_LABELS = { land: "랜드만", land_hotel: "랜드+숙박", full: "풀패키지(항공 포함)" } as const;

const LINE = "────────────────────";

function includedLabels(includes: CompetitorIncludes, included: boolean): string[] {
  return (Object.keys(INCLUDE_LABELS) as (keyof CompetitorIncludes)[])
    .filter((k) => includes[k] === included)
    .map((k) => INCLUDE_LABELS[k]);
}

function hotelLine(hotel: NonNullable<TripInput["selectedHotel"]>): string {
  return `${hotel.name} (${hotel.grade}, ${hotel.area})`;
}

function titleOf(input: TripInput): string {
  return `${input.destination} ${input.nights}박 ${input.days}일`;
}

/** 세미투어 항목: 번호 + 설명 + 이동 시간 */
function numberedLines(items: ItineraryItem[], detail: (item: ItineraryItem) => string): string[] {
  return items.flatMap((item, index) => {
    const lines = [`${index + 1}. ${item.name} ${detail(item)}`.trimEnd()];
    if (item.description) lines.push(`   ${item.description}`);
    if (item.travelMinutesToNext !== null && item.travelMinutesToNext > 0)
      lines.push(`   ↓ 이동 ${formatDuration(item.travelMinutesToNext)}`);
    return lines;
  });
}

/** 업체 코스 항목: 유형 이모지 + 이름 (순서대로) */
function linearLines(items: ItineraryItem[], detail: (item: ItineraryItem) => string): string[] {
  return items.flatMap((item) => {
    const emoji = ITEM_TYPE_META[item.type ?? "sightseeing"].emoji;
    const lines = [`${emoji} ${item.name} ${detail(item)}`.trimEnd()];
    if (item.description) lines.push(`   ${item.description}`);
    return lines;
  });
}

function dayBlocks(
  { days, pmChoice }: Pick<ExportData, "days" | "pmChoice">,
  detail: (item: ItineraryItem) => string,
  options: { altNote: boolean; showOvernight: boolean },
): string[] {
  return days.flatMap((day) => {
    const overnight = options.showOvernight && day.overnightCity ? ` (숙박: ${day.overnightCity})` : "";
    const head = `[DAY ${day.day}] ${day.theme}${overnight}`;

    if (day.kind === "linear") return [head, "", ...linearLines(day.items, detail), ""];

    const pm = pickPmOption(day, pmChoice);
    const others = day.pmFreeOptions.filter((o) => o.id !== pm?.id);
    return [
      head,
      "",
      "■ 오전 · 가이드 투어",
      ...numberedLines(day.amGuided, detail),
      "",
      `■ 오후 · 반자유 일정 (코스 ${pm?.id}: ${pm?.title ?? ""})`,
      ...(pm ? numberedLines(pm.items, detail) : []),
      ...(options.altNote && others.length > 0
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
    const parts: string[] = [];
    if (item.timeNote) parts.push(item.timeNote);
    else if (item.stayMinutes > 0) parts.push(`체류 ${formatDuration(item.stayMinutes)}`);
    if (item.admission === "view_only") parts.push("외부 조망");
    if (item.entryFee > 0) parts.push(`${item.type === "experience" || item.type === "massage" ? "체험비" : "입장료"} ${money(item.entryFee)}`);
    if (item.mealCost > 0) parts.push(`식대 ${money(item.mealCost)}`);
    return parts.length > 0 ? `(${parts.join(" · ")})` : "";
  };

  const lines: string[] = [
    `[세미투어 견적서 — 내부용] ${titleOf(input)}`,
    `${quote.travelers}명 · 통화 ${input.currency} · 구성 ${PACKAGE_LABELS[quote.packageType]}${data.meta?.packageName ? ` · ${data.meta.packageName}` : ""}`,
    LINE,
    "",
    ...dayBlocks(data, cost, { altNote: true, showOvernight: true }),
    LINE,
    "■ 견적",
    ...quote.lines
      .filter((l) => l.amount > 0)
      .map(
        (l) =>
          `${l.label}: ${money(l.amount)}${l.note ? ` (${l.note})` : ""}${l.excluded ? " [미정·가격에서 제외]" : l.status === "estimated" ? " [추정]" : ""}`,
      ),
    `총 원가: ${money(s.baseCost)} (1인 ${money(s.costPerPerson)})${quote.undecidedLabels.length > 0 ? " — 미정 항목 제외 기준" : ""}`,
    ...(quote.withUndecided
      ? [`미정 항목(${quote.undecidedLabels.join(", ")}) 포함 시: 총 원가 ${money(quote.withUndecided.baseCost)} · 1인 ${money(quote.withUndecided.pricePerPerson)} · 이익률 ${quote.withUndecided.actualMarginRate.toFixed(1)}%`]
      : []),
    `카드 수수료: ${money(s.cardFee)}`,
    `예상 이익: ${money(s.profit)} (마진율 ${s.actualMarginRate.toFixed(1)}%)`,
    `▶ ${quote.pricingMode === "fixed_price" ? "판매가(직접 입력)" : "최종 권장 판매가"}: 1인 ${money(s.pricePerPerson)} / 총 ${money(s.totalPrice)}`,
    "",
    ...(quote.lodgingUnits > 0
      ? [
          `숙소: ${quote.lodgingUnits}${input.lodgingType === "bnb" ? "유닛" : "실"} (${input.nights}박)`,
          ...(input.selectedHotel ? [`선택한 숙소: ${hotelLine(input.selectedHotel)}${input.selectedHotel.priceBasis === "estimated" ? " [요금 추정]" : ""}`] : []),
          "",
        ]
      : [""]),
    "인원별 1인 " + (quote.pricingMode === "fixed_price" ? "판매가" : "권장가"),
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
  const { input, quote, meta } = data;
  const money = (v: number) => formatMoney(v, input.currency);
  const s = quote.scenario;

  const detail = (item: ItineraryItem) => {
    if (item.timeNote) return `(${item.timeNote})`;
    if (item.admission === "view_only") return "(외부 조망)";
    return item.stayMinutes > 0 ? `(약 ${formatDuration(item.stayMinutes)})` : "";
  };
  const included = includedLabels(quote.ourIncludes, true);
  const isSemi = data.days.some((d) => d.kind === "semi");
  const excluded = [...includedLabels(quote.ourIncludes, false), ...(isSemi ? ["저녁 식사(자유식)"] : []), "개인 경비"];
  const labels = [meta?.noShopping ? "노쇼핑" : "", meta?.noOption ? "노옵션" : ""].filter(Boolean);

  return [
    `${labels.length > 0 ? `[${labels.join("·")}] ` : ""}[${titleOf(input)}]`,
    `${quote.travelers}명 기준 · 1인 ${money(s.pricePerPerson)} (총 ${money(s.totalPrice)})`,
    ...(isSemi ? ["오전에는 가이드와 함께, 오후에는 자유롭게 즐기는 세미투어입니다."] : []),
    ...(meta && meta.highlights.length > 0 ? ["", "★ " + meta.highlights.join(" + ")] : []),
    LINE,
    "",
    ...dayBlocks(data, detail, { altNote: false, showOvernight: false }),
    LINE,
    ...(input.selectedHotel && quote.lodgingUnits > 0
      ? [`■ 숙소: ${hotelLine(input.selectedHotel)}`]
      : meta?.hotelGrade
        ? [`■ 숙소: ${meta.hotelGrade}`]
        : []),
    `■ 포함 사항: ${included.length > 0 ? included.join(", ") : "별도 안내"}`,
    `■ 불포함 사항: ${excluded.join(", ")}`,
    "※ 입장료와 식대 등은 현지 사정에 따라 변동될 수 있습니다.",
    ...(quote.undecidedLabels.length > 0 ? ["※ 일부 구성 요소의 요금이 확정되지 않아 최종 금액이 달라질 수 있습니다."] : []),
  ]
    .join("\n")
    .trim();
}
