import { vehicleClassFor } from "@/lib/autoBuild";
import { gradeText } from "@/lib/itemTypes";
import type { PmChoice } from "@/lib/itinerary";
import { gradeOptions, inputWithGrade, salePrice, weekdayPriceRows } from "@/lib/priceLevers";
import type { CourseMeta, DayPlan, HotelGrade, QuoteData, TripInput } from "@/types";

/**
 * 고객 제시용 가격 — 상담·브로셔에 바로 쓰는 두 가지.
 *  ① A/B/C안: 숙소 등급만 다른 세 안의 1인 요금·총액·차액 (지금 등급이 추천안)
 *  ② 인원별 요금표: 인원(행) × 출발 요일(업체 요일별 요금이 있으면) 또는 A/B/C안(열)의 1인 요금
 * 고객에게 나가는 표라 원가·수익률은 넣지 않는다(화면 안내에만).
 */

const STEPS: HotelGrade[] = ["3", "3-4", "4", "4-5", "5"];

/** 지금 등급을 가운데로 세 안 — 단일 등급은 한 등급씩(3·4·5성), 섞인 등급은 양쪽 끝 단일 등급과 함께 */
export function planGrades(current: HotelGrade): HotelGrade[] {
  if (current === "3-4") return ["3", "3-4", "4"];
  if (current === "4-5") return ["4", "4-5", "5"];
  if (current === "3" || current === "4" || current === "5" || current === "3-5") return ["3", "4", "5"];
  return [];
}

export interface PricePlan {
  key: "A" | "B" | "C";
  grade: HotelGrade;
  label: string;
  salePrice: number;
  totalPrice: number;
  /** 지금(추천) 안 대비 1인 차액 */
  diff: number;
  isCurrent: boolean;
  /** 화면 안내용 (고객 문서에는 넣지 않음) */
  marginRate: number | null;
}

export function pricePlans(input: TripInput, days: DayPlan[], pmChoice: PmChoice, quote: QuoteData, meta: CourseMeta | null): PricePlan[] {
  const wanted = planGrades(input.hotelGrade);
  const rows = gradeOptions(input, days, pmChoice, quote, meta).filter((r) => wanted.includes(r.grade) && r.salePrice !== null);
  if (rows.length < 2) return [];
  const travelers = Math.max(1, Math.round(input.travelers));
  // 지금 등급이 세 안에 없으면(3~5성 섞어서) 가운데 안을 기준으로
  const base = rows.find((r) => r.grade === input.hotelGrade) ?? rows[Math.floor(rows.length / 2)];
  return rows
    .sort((a, b) => STEPS.indexOf(a.grade) - STEPS.indexOf(b.grade))
    .map((r, i) => ({
      key: (["A", "B", "C"] as const)[i],
      grade: r.grade,
      label: gradeText(r.grade),
      salePrice: r.salePrice!,
      totalPrice: r.salePrice! * travelers,
      diff: r.salePrice! - base.salePrice!,
      isCurrent: r.grade === base.grade,
      marginRate: r.marginRate,
    }));
}

export interface PriceGridColumn {
  label: string;
  /** 이 열의 견적 입력으로 바꾸기 */
  apply: (input: TripInput) => TripInput;
}

export interface PriceGridRow {
  travelers: number;
  /** 열마다 1인 요금 (계산이 안 되면 null) */
  prices: (number | null)[];
  /** 업체 최소 출발 인원보다 적음 */
  belowMin: boolean;
  /** 지금 견적의 차종과 다른 차가 필요한 인원 (차량비를 다시 확인해야 함) */
  vehicleChange: string | null;
  isCurrent: boolean;
}

export interface PriceGrid {
  kind: "weekday" | "plan" | "single";
  columns: string[];
  rows: PriceGridRow[];
  minTravelers: number;
}

const SIZES = [2, 4, 6, 8, 10, 12, 15, 20];

/** 인원별 요금표 — 업체 요일별 요금이 있으면 요일별, 없으면 A/B/C안별, 둘 다 없으면 1인 요금 한 열 */
export function priceGrid(input: TripInput, days: DayPlan[], pmChoice: PmChoice, quote: QuoteData, meta: CourseMeta | null): PriceGrid {
  const weekdays = weekdayPriceRows(input, days, pmChoice);
  const plans = weekdays.length >= 2 ? [] : pricePlans(input, days, pmChoice, quote, meta);
  const cols: PriceGridColumn[] =
    weekdays.length >= 2
      ? weekdays.map((w) => ({ label: w.label, apply: (i) => ({ ...i, supplierPricePerPerson: w.supplierPrice }) }))
      : plans.length >= 2
        ? plans.map((p) => ({ label: `${p.key}안 ${p.label}`, apply: (i) => inputWithGrade(i, p.grade) }))
        : [{ label: "1인 요금", apply: (i) => i }];
  const current = Math.max(1, Math.round(input.travelers));
  const minTravelers = Math.max(0, Math.round(input.minTravelers || 0));
  const sizes = [...new Set([...SIZES.filter((n) => n <= Math.max(20, current)), current])].sort((a, b) => a - b);
  const ownCost = input.pricingMode !== "supplier" && input.vehicleCostPerDay > 0;
  return {
    kind: weekdays.length >= 2 ? "weekday" : plans.length >= 2 ? "plan" : "single",
    columns: cols.map((c) => c.label),
    minTravelers,
    rows: sizes.map((n) => {
      const vehicle = vehicleClassFor(n);
      return {
        travelers: n,
        prices: cols.map((c) => salePrice({ ...c.apply(input), travelers: n }, days, pmChoice)),
        belowMin: minTravelers > 0 && n < minTravelers,
        vehicleChange: ownCost && vehicle !== vehicleClassFor(current) ? vehicle : null,
        isCurrent: n === current,
      };
    }),
  };
}

/** 엑셀에 붙여 넣는 탭 구분 표 */
export function priceGridTsv(grid: PriceGrid): string {
  const head = ["인원", ...grid.columns].join("\t");
  const body = grid.rows.map((r) => [`${r.travelers}명${r.belowMin ? " (최소 인원 미만)" : ""}`, ...r.prices.map((p) => (p === null ? "" : String(Math.round(p))))].join("\t"));
  return [head, ...body].join("\n");
}
