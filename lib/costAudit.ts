import type { TripInput } from "@/types";

/**
 * 저장한 상품 원가 점검 — 오래 묵은 상품을 그대로 팔면 손해 보기 쉬운 것들을 찾는다.
 *  - 환율: 견적 통화(외화)나 외화 업체 견적이 저장할 때보다 2% 넘게 바뀌었는지
 *  - 원가 확인일: 차량·숙박·항공 등 원가를 넣은 지 30일이 넘었는지
 *  - 출발일이 이미 지났는지
 * 환율은 지금 값(원화 기준)을 받아서 계산한다 (조회는 화면에서).
 */

export interface AuditFlag {
  tone: "warn" | "info";
  text: string;
}

const STALE_DAYS = 30;
const FX_PCT = 2;
const COST_NAMES: Record<string, string> = { vehicle: "차량", guide: "가이드", lodging: "숙박", flight: "항공", admission: "입장료", meal: "식사", tip: "팁", insurance: "보험" };

/** 지금 1단위 = 몇 원 (KRW = 1). 모르면 null */
export type FxNow = Record<string, number | null>;

export function currenciesOf(input: TripInput): string[] {
  const out = new Set<string>();
  if (input.currency !== "KRW") out.add(input.currency);
  const q = input.supplierQuote;
  if (q?.rate && q.originalCurrency && q.originalCurrency.toUpperCase() !== input.currency) out.add(q.originalCurrency.toUpperCase());
  return [...out];
}

export function auditPlan(input: TripInput, fx: FxNow, today = new Date()): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const pct = (a: number, b: number) => Math.round((a / b - 1) * 1000) / 10;
  // 견적 통화가 외화면 원화 환산(환율)이 저장할 때와 얼마나 다른지
  if (input.currency !== "KRW" && input.exchangeRateToKrw > 0 && fx[input.currency]) {
    const c = pct(fx[input.currency]!, input.exchangeRateToKrw);
    if (Math.abs(c) >= FX_PCT) flags.push({ tone: c > 0 ? "warn" : "info", text: `${input.currency} 환율 ${c > 0 ? "+" : ""}${c}% — 원화 판매가·원가를 다시 확인하세요` });
  }
  // 외화 업체 견적: 받을 때 환율(원문 1 = 앱 통화 몇) 대비
  const q = input.supplierQuote;
  const orig = q?.originalCurrency?.toUpperCase() ?? "";
  if (input.pricingMode === "supplier" && q?.rate && orig && orig !== input.currency && fx[orig] && (input.currency === "KRW" || fx[input.currency])) {
    const now = fx[orig]! / (input.currency === "KRW" ? 1 : fx[input.currency]!);
    const c = pct(now, q.rate);
    if (Math.abs(c) >= FX_PCT) {
      const diff = Math.round(input.supplierPricePerPerson * (now / q.rate - 1));
      flags.push({ tone: c > 0 ? "warn" : "info", text: `업체 견적 ${orig} 환율 ${c > 0 ? "+" : ""}${c}% — 1인 공급가 약 ${diff > 0 ? "+" : ""}${diff.toLocaleString("ko-KR")} ${input.currency}` });
    }
  }
  // 원가를 넣은 지 오래된 항목
  const old = Object.entries(input.costSource ?? {})
    .map(([k, s]) => ({ k, days: s?.at ? Math.floor((today.getTime() - new Date(s.at).getTime()) / 86_400_000) : NaN }))
    .filter((x) => Number.isFinite(x.days) && x.days > STALE_DAYS);
  if (old.length > 0) {
    const oldest = Math.max(...old.map((x) => x.days));
    flags.push({ tone: "warn", text: `원가 확인 ${oldest}일 지남 (${old.map((x) => COST_NAMES[x.k] ?? x.k).join("·")}) — 시세를 다시 조회하세요` });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.departureDate) && new Date(`${input.departureDate}T23:59:59`) < today) flags.push({ tone: "info", text: "출발일이 지났습니다 — 다음 출발일로 바꿔 다시 견적" });
  return flags;
}
