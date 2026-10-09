import { vehicleClassFor } from "@/lib/autoBuild";
import { priceLabel } from "@/lib/channels";
import { lodgingRoomsFor } from "@/lib/cost";
import { costSourceLabel } from "@/lib/costSource";
import { dayItems, overnightNights, type PmChoice } from "@/lib/itinerary";
import { lodgingSegments } from "@/lib/lodging";
import { singleSupplement } from "@/lib/pricing";
import type { CostLine, DayPlan, QuoteData, TripInput } from "@/types";

/**
 * 원가 계산서 — 여행사 원가표 형식으로 항목마다 "단가 × 수량 = 금액"과 1인 금액, 출처·확정 여부를 펼친다.
 * 숙박은 호텔·도시별, 입장료·식사는 일정 항목별로 나눈다. 합계는 견적의 총 원가와 같다.
 */

export interface SheetRow {
  group: string;
  item: string;
  /** 단가 (모르면 null — 비율로 계산하는 예비비 등) */
  unitPrice: number | null;
  /** 수량 설명 (예: "2.5실 × 3박", "4명") */
  qty: string;
  amount: number;
  perPerson: number;
  /** 확정 / 추정 / 미정·제외 */
  status: string;
  source: string;
  /** 미정이라 합계에서 뺀 줄 */
  excluded: boolean;
}

export interface CostSheet {
  rows: SheetRow[];
  total: number;
  perPerson: number;
  /** 판매가·수익 요약 (라벨, 값) */
  summary: { label: string; value: number | string }[];
}

const STATUS: Record<string, string> = { confirmed: "확정", estimated: "추정", undecided: "미정·제외" };

export function buildCostSheet(input: TripInput, days: DayPlan[], pmChoice: PmChoice, quote: QuoteData): CostSheet {
  const n = quote.travelers;
  const rows: SheetRow[] = [];
  const push = (line: CostLine | undefined, group: string, item: string, unitPrice: number | null, qty: string, amount = line?.amount ?? 0) => {
    rows.push({
      group,
      item,
      unitPrice,
      qty,
      amount,
      perPerson: amount / n,
      status: line?.excluded ? STATUS.undecided : STATUS[line?.status ?? "confirmed"] ?? "확정",
      source: costSourceLabel(line?.source),
      excluded: Boolean(line?.excluded),
    });
  };
  const line = (key: string) => quote.lines.find((l) => l.key === key);

  if (input.pricingMode === "supplier") push(line("supplier"), "랜드", "랜드사 공급가 (2인 1실 기준)", input.supplierPricePerPerson, `${n}명`);

  const flight = line("flight");
  if (flight) push(flight, "항공", "왕복 항공료", input.flightPricePerPerson, `${n}명`);

  const lodging = line("lodging");
  if (lodging) {
    const rooms = lodgingRoomsFor(n, input).costRooms;
    const roomsText = Number.isInteger(rooms) ? `${rooms}` : rooms.toFixed(1);
    const unit = input.lodgingType === "bnb" ? "유닛" : "실";
    const hotels = Object.entries(input.selectedHotels);
    for (const seg of lodgingSegments(input, overnightNights(days))) {
      const name = (seg.city ? input.selectedHotels[seg.city]?.name : hotels[0]?.[1].name) ?? (input.lodgingType === "bnb" ? "BnB" : "호텔");
      push(lodging, "숙박", `${name}${seg.city ? ` (${seg.city})` : ""}`, seg.rate, `${roomsText}${unit} × ${seg.nights}박`, rooms * seg.rate * seg.nights);
    }
  }
  const extraBed = line("lodging-extrabed");
  if (extraBed) push(extraBed, "숙박", "엑스트라베드 (3인 1실)", input.extraBedPerNight, extraBed.note?.split(" × ").slice(0, 2).join(" × ") ?? "");
  const cleaning = line("lodging-cleaning");
  if (cleaning) push(cleaning, "숙박", "청소비", input.cleaningFeePerUnit, cleaning.note?.split(" × ")[0] ?? "");
  const tax = line("lodging-tax");
  if (tax) push(tax, "숙박", "숙박세", input.cityTaxPerPersonPerNight, `${n}명 × ${input.nights}박`);

  const vehicle = line("vehicle");
  if (vehicle) push(vehicle, "지상", `차량 — ${vehicleClassFor(n)}`, input.vehicleCostPerDay, `${quote.groundDays}일 × 1대`);
  const guide = line("guide");
  if (guide) push(guide, "지상", "가이드", input.guideCostPerDay, `${quote.groundDays}일`);

  // 입장료·식사는 일정 항목별로 (고객이 현지에서 내는 항목은 판매가에 들어가지 않으므로 뺀다)
  for (const day of days) {
    for (const item of dayItems(day, pmChoice)) {
      if (item.payment === "local") continue;
      const status = item.isEstimated ? "추정" : item.feeCheck && item.feeCheck.status !== "unverified" ? "확정" : "직접 입력";
      const source = item.isEstimated ? "AI 추정" : item.feeCheck?.sourceName ? `웹 확인 · ${item.feeCheck.sourceName}` : "";
      if (item.entryFee > 0) rows.push({ group: "입장·체험", item: `DAY ${day.day} ${item.name}`, unitPrice: item.entryFee, qty: `${n}명`, amount: item.entryFee * n, perPerson: item.entryFee, status, source, excluded: false });
      if (item.mealCost > 0) rows.push({ group: "식사", item: `DAY ${day.day} ${item.name}`, unitPrice: item.mealCost, qty: `${n}명`, amount: item.mealCost * n, perPerson: item.mealCost, status, source, excluded: false });
    }
  }

  const other = line("other");
  if (other && other.amount > 0) push(other, "기타", "기타 고정비", other.amount, "1식");
  const tip = line("tip");
  if (tip && tip.amount > 0) push(tip, "기타", "팁", input.tipPerPerson, `${n}명`);
  const insurance = line("insurance");
  if (insurance && insurance.amount > 0) push(insurance, "기타", "여행자 보험", input.insurancePerPerson, `${n}명`);
  const contingency = line("contingency");
  if (contingency && contingency.amount > 0) push(contingency, "기타", `예비비 (${input.contingencyRate}%)`, null, contingency.note ?? "");
  const fx = line("fx-buffer");
  if (fx && fx.amount > 0) push(fx, "기타", `환율 변동 버퍼 (${input.fxBufferRate}%)`, null, fx.note ?? "");

  const total = rows.reduce((s, r) => s + (r.excluded ? 0 : r.amount), 0);
  const s = quote.scenario;
  const single = singleSupplement(quote, input);
  const summary: CostSheet["summary"] = [
    { label: "총 원가", value: total },
    { label: "1인 원가 (2인 1실 기준)", value: total / n },
    { label: priceLabel(quote.pricingMode), value: s.pricePerPerson },
    { label: `총 판매가 (${n}명)`, value: s.totalPrice },
    { label: "카드 수수료", value: s.cardFee },
    { label: "회사 이익", value: s.profit },
    { label: "마진율", value: `${s.actualMarginRate.toFixed(1)}%` },
    ...(single ? [{ label: `싱글차지 (1인실, ${single.travelers}명 해당)`, value: single.price }] : []),
    ...(quote.partnerConsumerPrice !== null ? [{ label: "거래처 권장 소비자가", value: quote.partnerConsumerPrice }] : []),
  ];
  return { rows, total, perPerson: total / n, summary };
}

/** 엑셀(시트)로 옮길 표 — 제목·조건, 원가 항목, 합계, 판매가·수익 */
export function costSheetTable(sheet: CostSheet, title: string, conditions: string): (string | number)[][] {
  const round = (v: number) => Math.round(v);
  return [
    [title],
    [conditions],
    [],
    ["구분", "항목", "단가", "수량", "금액", "1인 금액", "확정 여부", "출처"],
    ...sheet.rows.map((r) => [r.group, r.item, r.unitPrice === null ? "" : round(r.unitPrice), r.qty, round(r.amount), round(r.perPerson), r.status, r.source]),
    [],
    ["합계", "", "", "", round(sheet.total), round(sheet.perPerson), "", ""],
    [],
    ...sheet.summary.map((s) => [s.label, "", "", "", typeof s.value === "number" ? round(s.value) : s.value]),
  ];
}
