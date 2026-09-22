import { compareWithCompetitors } from "@/lib/cost";
import { formatMoney } from "@/lib/currency";
import { customerFeeNote, feeTag, itemFeeText, localPayRows, localPaySection, moneyWithKrw } from "@/lib/fees";
import { formatDuration } from "@/lib/format";
import { ITEM_TYPE_META } from "@/lib/itemTypes";
import { pickPmOption, type PmChoice } from "@/lib/itinerary";
import { simulateOptions } from "@/lib/options";
import type {
  CompetitorIncludes,
  CourseMeta,
  DayPlan,
  ItineraryItem,
  QuoteData,
  TripInput,
  UspItem,
} from "@/types";

export interface ExportData {
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

export const PACKAGE_LABELS = { land: "랜드만", land_hotel: "랜드+숙박", full: "풀패키지(항공 포함)" } as const;

export const LINE = "────────────────────";

export function includedLabels(includes: CompetitorIncludes, included: boolean): string[] {
  return (Object.keys(INCLUDE_LABELS) as (keyof CompetitorIncludes)[])
    .filter((k) => includes[k] === included)
    .map((k) => INCLUDE_LABELS[k]);
}

export function hotelLine(hotel: NonNullable<TripInput["selectedHotel"]>): string {
  return `${hotel.name} (${hotel.grade}, ${hotel.area})`;
}

/** 선택 옵션이 있으면 노옵션 표기는 쓸 수 없다 */
export function claimsNoOption(input: TripInput, meta: CourseMeta | null): boolean {
  return !!meta?.noOption && input.options.length === 0;
}

export function titleOf(input: TripInput): string {
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
    if (item.entryFee > 0) parts.push(`${item.type === "experience" || item.type === "massage" ? "체험비" : "입장료"} ${itemFeeText(item.entryFee, item, input)}`);
    if (item.mealCost > 0) parts.push(`식대 ${moneyWithKrw(item.mealCost, input.currency, input.exchangeRateToKrw)}`);
    const text = parts.length > 0 ? `(${parts.join(" · ")})` : "";
    return `${text}${feeTag(item)}`.trim();
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

  const localPay = localPayRows(data.days, data.pmChoice);
  if (localPay.rows.length > 0) {
    lines.push("", LINE, "■ 현지 지불(불포함) 항목 — 원가·판매가에서 제외됨");
    localPay.rows.forEach((r) => lines.push(`- DAY ${r.day} ${r.name}: ${r.amount > 0 ? itemFeeText(r.amount, r.item, input) : "금액 미입력"}${feeTag(r.item)}`));
    if (localPay.perPerson > 0) lines.push(`1인 합계: ${moneyWithKrw(localPay.perPerson, input.currency, input.exchangeRateToKrw)}`);
  }

  if (input.options.length > 0) {
    const sim = simulateOptions(input.options, quote.travelers, input.cardFeeRate);
    lines.push("", LINE, "■ 선택 옵션 (기본 견적·판매가에 포함되지 않음)");
    sim.rows.forEach(({ option, participants, runs, profit }) => {
      lines.push(
        `- ${option.name}${option.dayNo > 0 ? ` (DAY ${option.dayNo})` : ""}: 원가 ${money(option.costPerPerson)} / 요금 ${money(option.pricePerPerson)} · 최소 ${option.minParticipants}명 · 예상 참여율 ${option.participationRate}% (${participants}명) → ${runs ? `이익 ${money(profit)}` : "최소 인원 미달, 진행 안 됨"}`,
      );
    });
    lines.push(
      `옵션 합계: 매출 ${money(sim.revenue)} · 원가 ${money(sim.cost)} · 카드 수수료 ${money(sim.cardFee)} · 이익 ${money(sim.profit)} (${sim.marginRate.toFixed(1)}%)`,
      `기본 상품 이익 ${money(s.profit)} + 옵션 이익 ${money(sim.profit)} = ${money(s.profit + sim.profit)}`,
    );
  }

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
  const s = quote.scenario;

  const detail = (item: ItineraryItem) => {
    const time = item.timeNote
      ? item.timeNote
      : item.admission === "view_only"
        ? "외부 조망"
        : item.stayMinutes > 0
          ? `약 ${formatDuration(item.stayMinutes)}`
          : "";
    const parts = [time, customerFeeNote(item, input)].filter(Boolean);
    return parts.length > 0 ? `(${parts.join(" · ")})` : "";
  };
  const localPayLines = localPaySection(data.days, data.pmChoice, input, false);
  const included = includedLabels(quote.ourIncludes, true);
  const isSemi = data.days.some((d) => d.kind === "semi");
  const excluded = [
    ...includedLabels(quote.ourIncludes, false),
    ...(isSemi ? ["저녁 식사(자유식)"] : []),
    ...(localPayLines.length > 0 ? ["현지 지불 항목(별도 안내 참고)"] : []),
    "개인 경비",
  ];
  const labels = [meta?.noShopping ? "노쇼핑" : "", claimsNoOption(input, meta) ? "노옵션" : ""].filter(Boolean);

  return [
    `${labels.length > 0 ? `[${labels.join("·")}] ` : ""}[${titleOf(input)}]`,
    `${quote.travelers}명 기준 · 1인 ${moneyWithKrw(s.pricePerPerson, input.currency, input.exchangeRateToKrw)} (총 ${moneyWithKrw(s.totalPrice, input.currency, input.exchangeRateToKrw)})`,
    ...(isSemi ? ["오전에는 가이드와 함께, 오후에는 자유롭게 즐기는 세미투어입니다."] : []),
    ...(meta && meta.highlights.length > 0 ? ["", "★ " + meta.highlights.join(" + ")] : []),
    LINE,
    "",
    ...dayBlocks(data, detail, { altNote: false, showOvernight: false }),
    LINE,
    ...(input.options.length > 0
      ? [
          "■ 선택 옵션 안내 (기본 요금에 포함되어 있지 않으며, 참여는 자유입니다)",
          ...input.options.map(
            (o) =>
              `- ${o.name}${o.dayNo > 0 ? ` (DAY ${o.dayNo}${o.durationMinutes > 0 ? ` · 약 ${formatDuration(o.durationMinutes)}` : ""})` : o.durationMinutes > 0 ? ` (약 ${formatDuration(o.durationMinutes)})` : ""}: 1인 ${moneyWithKrw(o.pricePerPerson, input.currency, input.exchangeRateToKrw)} · 최소 ${o.minParticipants}명 이상 신청 시 진행`,
          ),
          "※ 옵션에 참여하지 않으시는 경우 자유시간 또는 대체 일정으로 진행됩니다. 옵션은 현지 사정에 따라 변경·취소될 수 있습니다.",
          LINE,
        ]
      : []),
    ...(localPayLines.length > 0 ? [...localPayLines, LINE] : []),
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
