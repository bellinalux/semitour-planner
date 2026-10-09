import { calculateQuote } from "@/lib/cost";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { quoteItemState, type QuoteItemKey } from "@/lib/supplierQuote";
import type { DayPlan, QuoteData, SupplierQuote, TripInput } from "@/types";

/**
 * 업체 견적 검증표 — 업체(랜드사) 견적을 우리 시세와 견적서 내용으로 검증한다.
 *  ① 계산 확인: 항목 합계와 1인 요금, 인원·객실 기준, 싱글차지
 *  ② 시세 비교: 우리가 조회한 시세로 만든 원가(숙박·차량·가이드·입장·식사)와 업체 금액을 항목별로 — 높음/적정/낮음
 *  ③ 포함·불포함 체크: 꼭 확인할 항목이 견적서에 포함/불포함/안 적힘인지
 *  ④ 업체에 물어볼 질문 목록
 */

export type Category = "lodging" | "vehicle" | "guide" | "admission" | "meal";
export type Level = "high" | "ok" | "low" | "unknown";

export interface VerifyRow {
  key: Category | "total";
  label: string;
  /** 업체 금액 (1인). 견적서에 항목별 금액이 없으면 null */
  supplier: number | null;
  /** 우리 시세로 만든 원가 (1인). 시세를 모르면 null */
  market: number | null;
  level: Level;
  note: string;
}

export interface CheckItem {
  key: string;
  label: string;
  state: "included" | "excluded" | "missing";
  /** 견적서에서 찾은 문구 */
  evidence: string;
}

export interface SupplierVerify {
  /** 계산·기준 확인에서 나온 문제 */
  calcIssues: string[];
  rows: VerifyRow[];
  total: VerifyRow;
  /** 차량·가이드 시세가 있어 비교할 수 있는지 */
  marketReady: boolean;
  checklist: CheckItem[];
  questions: string[];
}

const CATEGORY_LABELS: Record<Category, string> = { lodging: "숙박 (2인 1실)", vehicle: "차량", guide: "가이드", admission: "입장·체험", meal: "식사" };
const CATEGORY_KEYWORDS: Record<Category, RegExp> = {
  lodging: /호텔|숙박|리조트|객실|룸|hotel|resort|room|accommodation/i,
  vehicle: /차량|버스|밴|승합|전용차|기사|vehicle|bus|van|car|transport/i,
  guide: /가이드|인솔|guide/i,
  admission: /입장|관광|투어|티켓|체험|크루즈|케이블카|admission|ticket|tour|entrance/i,
  meal: /식사|중식|석식|조식|식당|meal|lunch|dinner/i,
};

/** 업체 금액이 시세의 몇 배면 높음/낮음으로 볼지 — 랜드사 마진(10~25%)을 감안한다 */
const HIGH = 1.3;
const LOW = 0.85;

function levelOf(supplier: number | null, market: number | null): Level {
  if (supplier === null || market === null || market <= 0) return "unknown";
  const r = supplier / market;
  return r > HIGH ? "high" : r < LOW ? "low" : "ok";
}

export function categoryOf(label: string): Category | null {
  for (const key of Object.keys(CATEGORY_KEYWORDS) as Category[]) if (CATEGORY_KEYWORDS[key].test(label)) return key;
  return null;
}

/** 견적서 항목 금액을 1인 금액으로 (단위를 모르면 null) */
export function linePerPerson(line: SupplierQuote["lines"][number], ctx: { travelers: number; days: number; nights: number; guests: number }): number | null {
  switch (line.unit) {
    case "per_person":
      return line.amount;
    case "per_group":
      return line.amount / ctx.travelers;
    case "per_day":
      return (line.amount * ctx.days) / ctx.travelers;
    case "per_room_night":
      return (line.amount * ctx.nights) / ctx.guests;
    default:
      return null;
  }
}

/** 꼭 확인할 포함·불포함 항목 */
const CHECKS: { key: QuoteItemKey; label: string; when?: (i: TripInput) => boolean }[] = [
  { key: "lodging", label: "숙박", when: (i) => i.packageType !== "land" },
  { key: "vehicle", label: "전용 차량" },
  { key: "guide", label: "가이드" },
  { key: "admission", label: "입장료" },
  { key: "meal", label: "일정 중 식사" },
  { key: "tip", label: "가이드·기사 팁(경비)" },
  { key: "transfer", label: "공항 픽업·샌딩" },
  { key: "insurance", label: "여행자 보험" },
];

/** 호텔이 확정되지 않은 표기 (후보 여럿·동급) */
const UNDECIDED_HOTEL = /중\s*(하나|택)|또는|혹은|동급|\bor\b|\//i;

/** 받침이 있으면 "이", 없으면 "가" (한글이 아니면 "이(가)") */
export function subjectParticle(word: string): string {
  const ch = word
    .trim()
    .replace(/[)\]]+$/, "")
    .slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "이(가)";
  return code % 28 === 0 ? "가" : "이";
}

export function verifySupplierQuote(input: TripInput, days: DayPlan[], pmChoice: PmChoice, quote: QuoteData): SupplierVerify {
  const q = input.supplierQuote;
  const n = Math.max(1, quote.travelers);
  const ctx = { travelers: n, days: Math.max(1, quote.groundDays), nights: Math.max(1, input.nights), guests: Math.max(1, Math.round(input.guestsPerUnit)) };
  const money = (v: number) => Math.round(v).toLocaleString("ko-KR");
  const calcIssues: string[] = [];
  const questions: string[] = [];

  // ③ 포함·불포함 체크 (견적서를 읽었을 때만)
  const checklist: CheckItem[] = q
    ? CHECKS.filter((c) => !c.when || c.when(input)).map((c) => ({ key: c.key, label: c.label, ...quoteItemState(q, c.key) }))
    : [];
  const excluded = new Set(checklist.filter((c) => c.state === "excluded").map((c) => c.key));

  // ① 계산·기준 확인
  if (q) {
    if ((q.suspectPrice ?? 0) > 0) {
      calcIssues.push(
        `견적서에서 읽은 금액 ${(q.suspectPrice ?? 0).toLocaleString("ko-KR")} ${q.originalCurrency}는 불포함·선택관광 요금으로 보여 공급가로 넣지 않았습니다 — 상품 1인 요금을 확인해 직접 넣어 주세요.`,
      );
    }
    if (q.pricePerPerson <= 0 && input.supplierPricePerPerson <= 0) questions.push("이 상품의 1인 요금(2인 1실 기준)을 알려 주세요.");
    const min = q.minTravelers ?? 0;
    if (min > 0 && n < min) {
      calcIssues.push(`견적서의 최소 출발 인원은 ${min}명인데 지금 ${n}명입니다 — 이 인원으로는 출발하지 못하거나 요금이 달라집니다.`);
      questions.push(`${n}명으로 출발할 수 있는지, 가능하면 그때 1인 요금을 알려 주세요 (최소 ${min}명 조건).`);
    }
    if (q.hotels && UNDECIDED_HOTEL.test(q.hotels)) questions.push(`호텔이 확정되지 않았습니다 (${q.hotels.slice(0, 60)}). 확정 호텔 이름을 알려 주세요.`);
    // 요일·시즌별 요금이 메모에 따로 있으면(예: 일~화 4780 / 수 4880 / 토 4980) 1인 요금은 그중 하나일 뿐이다
    const notePrices = (q.notes.match(/\d[\d,]{2,}/g) ?? []).length;
    if (notePrices >= 2 && /요일|월|화|수|목|금|토|일|시즌|성수기|비수기|주말|평일/.test(q.notes)) {
      calcIssues.push(
        `요일·시즌별 요금이 따로 있습니다 (${q.notes.slice(0, 80)}${q.notes.length > 80 ? "…" : ""}) — 출발 요일·시즌 요금으로 공급가를 맞췄는지 확인하세요.`,
      );
      questions.push("출발일(요일·시즌)에 맞는 1인 요금을 확정해 주세요.");
    }
    // 코스에 항공편이 있는데 견적서에 항공 포함 여부가 없으면
    const hasFlight = days.some((d) => dayItems(d, pmChoice).some((i) => i.type === "flight"));
    if (hasFlight && quoteItemState(q, "flight").state === "missing") questions.push("코스의 항공편(항공권)이 요금에 포함인가요, 불포함인가요?");
    if (q.basisTravelers === 0) questions.push("견적이 몇 명 기준인지 알려 주세요.");
    else if (q.basisTravelers !== n && q.tiers.length === 0) {
      calcIssues.push(`견적은 ${q.basisTravelers}명 기준인데 지금 ${n}명입니다 — 인원이 다르면 1인 요금이 달라집니다.`);
      questions.push(`${n}명일 때 1인 요금을 알려 주세요 (지금 견적은 ${q.basisTravelers}명 기준).`);
    }
    if (q.roomBasis === "unknown" && input.packageType !== "land") questions.push("1인 요금이 2인 1실 기준인지 확인 부탁드립니다.");
    if (q.roomBasis === "single") calcIssues.push("견적이 1인 1실 기준입니다 — 우리 견적은 2인 1실 기준이라 1인 요금을 다시 받아야 합니다.");
    if (input.packageType !== "land" && q.singleSupplement === 0) questions.push("싱글차지(1인실 추가요금)를 알려 주세요.");
    const perPerson = q.lines.map((l) => linePerPerson(l, ctx));
    if (q.lines.length > 0 && perPerson.every((v) => v !== null) && q.rate !== null) {
      const sum = (perPerson as number[]).reduce((s, v) => s + v, 0);
      const price = input.supplierPricePerPerson;
      if (price > 0 && Math.abs(sum - price) > price * 0.03) {
        calcIssues.push(
          `항목별 금액을 1인으로 합치면 ${money(sum)}인데 1인 요금은 ${money(price)}입니다 — ${sum > price ? "할인이 들어갔거나" : "빠진 항목이나 업체 마진이 따로 있거나"} 계산이 틀렸을 수 있습니다.`,
        );
        questions.push("항목별 금액 합계와 1인 요금이 맞지 않습니다. 계산 내역을 확인 부탁드립니다.");
      }
    }
  }
  for (const c of checklist) {
    if (c.state === "missing") questions.push(`${c.label}${subjectParticle(c.label)} 포함인지 불포함인지 알려 주세요.`);
  }
  if (excluded.has("tip")) questions.push("가이드·기사 팁(경비)은 1인 얼마이고, 고객이 현지에서 내는 건가요?");
  if (excluded.has("admission")) {
    const paid = days.flatMap((d) => dayItems(d, pmChoice)).filter((i) => i.entryFee > 0 && i.type !== "meal");
    if (paid.length > 0)
      questions.push(
        `입장료가 불포함이면 ${paid
          .slice(0, 4)
          .map((i) => i.name)
          .join(", ")} 요금은 고객이 현지에서 내는 건가요?`,
      );
  }

  // ② 시세 비교 — 같은 입력을 '원가에서 시작'으로 계산한 값이 우리 시세
  const marketQuote = calculateQuote({ ...input, pricingMode: "target_margin" }, days, pmChoice);
  const marketLines = marketQuote.ok ? marketQuote.lines.filter((l) => !l.excluded) : [];
  const sumOf = (keys: string[]) => marketLines.filter((l) => keys.includes(l.key)).reduce((s, l) => s + l.amount, 0) / n;
  const marketBy: Record<Category, number | null> = {
    lodging: input.packageType === "land" ? null : sumOf(["lodging", "lodging-cleaning", "lodging-tax", "lodging-extrabed"]) || null,
    vehicle: sumOf(["vehicle"]) || null,
    guide: sumOf(["guide"]) || null,
    admission: sumOf(["admission"]) || null,
    meal: sumOf(["meal"]) || null,
  };
  const marketReady = marketBy.vehicle !== null || marketBy.guide !== null;

  const supplierBy: Partial<Record<Category, number>> = {};
  if (q && q.rate !== null) {
    for (const l of q.lines) {
      const cat = categoryOf(l.label);
      const v = linePerPerson(l, ctx);
      if (cat && v !== null) supplierBy[cat] = (supplierBy[cat] ?? 0) + v;
    }
  }

  const rows: VerifyRow[] = (Object.keys(CATEGORY_LABELS) as Category[])
    .filter((k) => !(k === "lodging" && input.packageType === "land"))
    .map((k) => {
      const out = excluded.has(k);
      const supplier = supplierBy[k] ?? null;
      const market = out ? null : marketBy[k];
      const level = levelOf(supplier, market);
      const note = out
        ? "견적서에 불포함 — 비교에서 뺐습니다"
        : market === null
          ? "우리 시세 없음"
          : supplier === null
            ? "견적서에 항목별 금액 없음"
            : level === "high"
              ? `시세보다 ${Math.round((supplier / market - 1) * 100)}% 높음`
              : level === "low"
                ? `시세보다 ${Math.round((1 - supplier / market) * 100)}% 낮음 — 포함 범위 확인`
                : "적정";
      if (level === "high")
        questions.push(`${CATEGORY_LABELS[k]} 금액(1인 ${money(supplier!)})이 시세(1인 약 ${money(market!)})보다 높습니다. 내역을 확인 부탁드립니다.`);
      return { key: k, label: CATEGORY_LABELS[k], supplier, market, level, note };
    });

  // 전체: 업체 1인 공급가 vs 우리 시세 원가 (불포함 항목은 빼고)
  const marketTotal = rows.reduce((s, r) => s + (r.market ?? 0), 0);
  const supplierTotal = input.supplierPricePerPerson > 0 ? input.supplierPricePerPerson : null;
  const totalLevel = marketReady ? levelOf(supplierTotal, marketTotal) : "unknown";
  const total: VerifyRow = {
    key: "total",
    label: "1인 공급가 전체",
    supplier: supplierTotal,
    market: marketReady ? marketTotal : null,
    level: totalLevel,
    note: !marketReady
      ? "차량·가이드 시세가 없어 비교하지 못했습니다 — 시세 조회를 먼저 하세요"
      : totalLevel === "high"
        ? `시세 원가보다 ${Math.round((supplierTotal! / marketTotal - 1) * 100)}% 높음 — 업체 마진을 감안해도 높아 협상 여지가 있습니다`
        : totalLevel === "low"
          ? `시세 원가보다 ${Math.round((1 - supplierTotal! / marketTotal) * 100)}% 낮음 — 빠진 항목·숨은 경비(쇼핑·옵션)가 없는지 확인하세요`
          : totalLevel === "ok"
            ? "시세 원가에 업체 마진을 더한 정도로 적정합니다"
            : "공급가가 없습니다",
  };
  if (totalLevel === "low") questions.push("요금이 시세보다 낮은데, 쇼핑·선택관광이나 현지에서 따로 받는 경비가 있나요?");
  if (totalLevel === "low" && supplierTotal !== null && supplierTotal < marketTotal * 0.5) {
    calcIssues.push("1인 공급가가 우리 시세 원가의 절반도 안 됩니다 — 옵션·불포함 요금이나 다른 인원 기준 요금을 상품 요금으로 잘못 넣지 않았는지 확인하세요.");
  }

  return { calcIssues, rows, total, marketReady, checklist, questions: [...new Set(questions)] };
}
