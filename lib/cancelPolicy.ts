/**
 * 취소 및 환불 규정 — 표준약관(제16조·소비자분쟁해결기준) 또는 회사·상품별 특별약관 구간.
 *  A. 구간 편집: "출발 ○일 전까지 → 전액 환불 / 예약금 차감 / 고정 금액 / ○% / 환불 불가"
 *  B. 출발일에서 실제 날짜 계산 + 영업일(주말·공휴일) 기준이면 실제 마감(직전 영업일 업무 종료)
 *  C. 계약서·일정표·견적서·웹 일정표에 같은 표
 *  D. 위험 점검 — 같은 시점 표준약관보다 높은 구간, 50% 초과, 환불 불가, 개런티 금액 없음, 주말 마감
 *  E. 취소 날짜로 취소료·환불액 계산 (예약 관리)
 */
import { formatMoney } from "@/lib/currency";
import type { CurrencyCode } from "@/types";

export type TierKind = "refund" | "deposit" | "fixed" | "percent" | "nonrefundable";

/** 출발 daysBefore일 전(그날 포함)부터 다음 구간 전까지 적용 — 구간은 daysBefore가 큰 것부터 */
export interface CancelTier {
  daysBefore: number;
  kind: TierKind;
  /** fixed: 1인 금액(원), percent: 여행요금의 % */
  value: number;
}

export type HighFeeReason = "" | "prepaid" | "charter" | "guarantee" | "peak";
export const REASON_LABEL: Record<Exclude<HighFeeReason, "">, string> = {
  prepaid: "항공·숙박 선납",
  charter: "전세기·크루즈 등 블록 계약",
  guarantee: "개런티(확정) 예약",
  peak: "성수기 특별 행사",
};

export interface CancelPolicy {
  /** standard: 표준약관(소비자분쟁해결기준) / custom: 특별약관 구간 */
  mode: "standard" | "custom";
  tiers: CancelTier[];
  /** 취소 접수를 영업일 기준으로 보는가 + 업무 종료 시각 */
  businessDays: boolean;
  businessEnd: string;
  /** 표준보다 높은 취소료의 사유 (특별약관의 정당성) */
  reason: HighFeeReason;
  /** 개런티 예약 — 기간과 관계없이 받는 1인 금액(원)과 설명. 0이면 없음 */
  guaranteeFee: number;
  guaranteeNote: string;
}

/** 표준약관이 인용하는 소비자분쟁해결기준 (여행자 귀책 취소) */
export const STANDARD_TIERS: CancelTier[] = [
  { daysBefore: 30, kind: "refund", value: 0 },
  { daysBefore: 20, kind: "percent", value: 10 },
  { daysBefore: 10, kind: "percent", value: 15 },
  { daysBefore: 8, kind: "percent", value: 20 },
  { daysBefore: 1, kind: "percent", value: 30 },
  { daysBefore: 0, kind: "percent", value: 50 },
];

export const STANDARD_POLICY: CancelPolicy = { mode: "standard", tiers: STANDARD_TIERS, businessDays: false, businessEnd: "18:00", reason: "", guaranteeFee: 0, guaranteeNote: "" };

/** 기본 틀 — 표준, 대형사 특별약관형(예: 50일 전 무료 → 예약금 → 70% → 환불 불가), 선납·전세기형 */
export const POLICY_PRESETS: { id: string; label: string; policy: CancelPolicy }[] = [
  { id: "standard", label: "표준약관 (소비자분쟁해결기준)", policy: STANDARD_POLICY },
  {
    id: "major",
    label: "대형사 특별약관형 (50일 전 무료·예약금·70%·환불 불가)",
    policy: {
      mode: "custom",
      tiers: [
        { daysBefore: 50, kind: "refund", value: 0 },
        { daysBefore: 40, kind: "deposit", value: 0 },
        { daysBefore: 21, kind: "percent", value: 70 },
        { daysBefore: 0, kind: "nonrefundable", value: 0 },
      ],
      businessDays: true,
      businessEnd: "18:00",
      reason: "prepaid",
      guaranteeFee: 0,
      guaranteeNote: "",
    },
  },
  {
    id: "prepaid",
    label: "선납·전세기형 (60일 전 무료 → 30% → 50% → 100%)",
    policy: {
      mode: "custom",
      tiers: [
        { daysBefore: 60, kind: "refund", value: 0 },
        { daysBefore: 30, kind: "percent", value: 30 },
        { daysBefore: 15, kind: "percent", value: 50 },
        { daysBefore: 0, kind: "percent", value: 100 },
      ],
      businessDays: true,
      businessEnd: "18:00",
      reason: "charter",
      guaranteeFee: 0,
      guaranteeNote: "",
    },
  },
];

export function normalizeCancelPolicy(v: unknown): CancelPolicy {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return STANDARD_POLICY;
  const o = v as Partial<CancelPolicy>;
  const kinds: TierKind[] = ["refund", "deposit", "fixed", "percent", "nonrefundable"];
  const tiers = Array.isArray(o.tiers)
    ? o.tiers
        .filter((t): t is CancelTier => typeof t === "object" && t !== null && kinds.includes((t as CancelTier).kind))
        .map((t) => ({ daysBefore: Math.min(365, Math.max(0, Math.round(Number(t.daysBefore) || 0))), kind: t.kind, value: Math.max(0, Number(t.value) || 0) }))
        .sort((a, b) => b.daysBefore - a.daysBefore)
        .slice(0, 12)
    : [];
  const mode = o.mode === "custom" && tiers.length > 0 ? "custom" : "standard";
  const reasons: HighFeeReason[] = ["", "prepaid", "charter", "guarantee", "peak"];
  return {
    mode,
    tiers: mode === "custom" ? tiers : STANDARD_TIERS,
    businessDays: o.businessDays === true,
    businessEnd: typeof o.businessEnd === "string" && /^\d{2}:\d{2}$/.test(o.businessEnd) ? o.businessEnd : "18:00",
    reason: reasons.includes(o.reason as HighFeeReason) ? (o.reason as HighFeeReason) : "",
    guaranteeFee: Math.max(0, Math.round(Number(o.guaranteeFee) || 0)),
    guaranteeNote: typeof o.guaranteeNote === "string" ? o.guaranteeNote.slice(0, 200) : "",
  };
}

/** 상품별 규정이 있으면 그것, 없으면 회사 기본 */
export function effectivePolicy(company: { cancelPolicy?: CancelPolicy }, input: { cancelPolicy?: CancelPolicy | null }): CancelPolicy {
  return normalizeCancelPolicy(input.cancelPolicy ?? company.cancelPolicy ?? STANDARD_POLICY);
}

// ── 문구 ──────────────────────────────────────────────

export function chargeText(t: CancelTier, currency: CurrencyCode = "KRW"): string {
  if (t.kind === "refund") return "전액 환불 (위약금 없음)";
  if (t.kind === "deposit") return "예약금(계약금) 환불 불가";
  if (t.kind === "fixed") return `1인 ${formatMoney(t.value, currency)} 차감`;
  if (t.kind === "percent") return t.value >= 100 ? "여행요금의 100% (환불 불가)" : `여행요금의 ${t.value}%`;
  return "환불 불가 (여행요금 100%)";
}

/** "출발 50일 전까지" / "출발 49일 ~ 40일 전" / "출발 20일 전 ~ 당일" */
export function rangeText(tiers: CancelTier[], i: number): string {
  const t = tiers[i];
  const prev = tiers[i - 1];
  const end = prev ? prev.daysBefore - 1 : null;
  const from = t.daysBefore === 0 ? "당일" : `${t.daysBefore}일 전`;
  if (end === null) return `출발 ${t.daysBefore}일 전까지`;
  if (end === t.daysBefore) return `출발 ${from}`;
  return `출발 ${end}일 ~ ${from}`;
}

// ── 날짜 (B) ─────────────────────────────────────────────

const parseIso = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export const dateLabel = (isoDate: string) => {
  const d = parseIso(isoDate);
  return d ? `${isoDate.replace(/-/g, ".")}(${DOW[d.getUTCDay()]})` : isoDate;
};

/** 영업일인가 (주말·공휴일 아님). holidays: "YYYY-MM-DD" 집합 */
export function isBusinessDay(isoDate: string, holidays: ReadonlySet<string>): boolean {
  const d = parseIso(isoDate);
  if (!d) return true;
  const w = d.getUTCDay();
  return w !== 0 && w !== 6 && !holidays.has(isoDate);
}

/** 그날 또는 그 전의 가장 가까운 영업일 */
export function businessOnOrBefore(isoDate: string, holidays: ReadonlySet<string>): string {
  let d = parseIso(isoDate);
  if (!d) return isoDate;
  for (let k = 0; k < 14 && !isBusinessDay(iso(d), holidays); k++) d = addDays(d, -1);
  return iso(d);
}

export interface ScheduleRow {
  range: string;
  charge: string;
  tier: CancelTier;
  /** 이 구간 첫날 (출발일 − daysBefore가 아니라 구간 시작 = 앞 구간 끝 다음날) / 마지막 날 */
  from: string | null;
  to: string | null;
  /** 영업일 기준일 때 이 구간에 들기 위한 실제 접수 마감 (구간 마지막 날이 휴일이면 직전 영업일) */
  deadline: string | null;
  /** 오늘이 이 구간인가 */
  current: boolean;
}

/** 출발일·오늘로 구간마다 실제 날짜를 계산한다 (출발일을 모르면 날짜 없이) */
export function cancelSchedule(policy: CancelPolicy, departureDate: string, today: string, holidays: ReadonlySet<string> = new Set(), currency: CurrencyCode = "KRW"): ScheduleRow[] {
  const dep = parseIso(departureDate);
  const tiers = policy.tiers;
  const todayDays = dep && parseIso(today) ? Math.round((dep.getTime() - parseIso(today)!.getTime()) / 86_400_000) : null;
  return tiers.map((t, i) => {
    const prev = tiers[i - 1];
    // 구간: [출발 − (prev.daysBefore − 1)일 ... 출발 − t.daysBefore일]
    const from = dep && prev ? iso(addDays(dep, -(prev.daysBefore - 1))) : null;
    const to = dep ? iso(addDays(dep, -t.daysBefore)) : null;
    const deadline = to && policy.businessDays ? businessOnOrBefore(to, holidays) : to;
    const current = todayDays !== null && todayDays >= t.daysBefore && (!prev || todayDays < prev.daysBefore);
    return { range: rangeText(tiers, i), charge: chargeText(t, currency), tier: t, from, to, deadline, current };
  });
}

/** 무료 취소 마감 (전액 환불 구간의 마지막 날·실제 접수 마감). 없으면 null */
export function freeCancelDeadline(rows: ScheduleRow[]): { date: string; deadline: string } | null {
  const free = rows.find((r) => r.tier.kind === "refund");
  return free?.to ? { date: free.to, deadline: free.deadline ?? free.to } : null;
}

// ── 계산 (E) ─────────────────────────────────────────────

export interface CancelQuote {
  /** 취소를 접수한 것으로 보는 날 (영업일 기준이면 휴일·업무 종료 뒤 → 다음 영업일) */
  noticeDate: string;
  daysBefore: number;
  tier: CancelTier;
  fee: number;
  refund: number;
  /** 낸 돈보다 취소료가 크면 더 받아야 할 금액 */
  owed: number;
  note: string;
}

/**
 * 취소 날짜·시각으로 취소료를 계산한다.
 * total: 여행요금 총액, deposit: 계약금, paid: 받은 돈, travelers: 인원 (고정 금액·항공 수수료는 1인 기준)
 */
export function cancelQuote(
  policy: CancelPolicy,
  o: { departureDate: string; noticeDate: string; noticeTime?: string; total: number; deposit: number; paid: number; travelers: number; airFeePerPerson?: number; ticketed?: boolean; holidays?: ReadonlySet<string> },
): CancelQuote | null {
  const dep = parseIso(o.departureDate);
  let notice = parseIso(o.noticeDate);
  if (!dep || !notice) return null;
  const holidays = o.holidays ?? new Set<string>();
  const notes: string[] = [];
  if (policy.businessDays) {
    const late = o.noticeTime && o.noticeTime > policy.businessEnd;
    if (late || !isBusinessDay(iso(notice), holidays)) {
      do notice = addDays(notice, 1);
      while (!isBusinessDay(iso(notice), holidays));
      notes.push(`영업일 기준 — ${dateLabel(iso(notice))} 접수로 봄`);
    }
  }
  const daysBefore = Math.round((dep.getTime() - notice.getTime()) / 86_400_000);
  const tier = policy.tiers.find((t) => daysBefore >= t.daysBefore) ?? policy.tiers[policy.tiers.length - 1];
  const n = Math.max(1, o.travelers);
  let fee =
    tier.kind === "refund" ? 0
    : tier.kind === "deposit" ? o.deposit
    : tier.kind === "fixed" ? tier.value * n
    : tier.kind === "percent" ? Math.round((o.total * Math.min(100, tier.value)) / 100)
    : o.total;
  if (policy.guaranteeFee > 0) {
    fee = Math.max(fee, policy.guaranteeFee * n);
    notes.push(`개런티 예약 1인 ${formatMoney(policy.guaranteeFee, "KRW")} 이상`);
  }
  if (o.ticketed && (o.airFeePerPerson ?? 0) > 0) {
    fee += (o.airFeePerPerson ?? 0) * n;
    notes.push(`항공권 취소 수수료 1인 ${formatMoney(o.airFeePerPerson ?? 0, "KRW")} 포함`);
  }
  fee = Math.min(fee, o.total + (o.ticketed ? (o.airFeePerPerson ?? 0) * n : 0));
  return { noticeDate: iso(notice), daysBefore, tier, fee, refund: Math.max(0, o.paid - fee), owed: Math.max(0, fee - o.paid), note: notes.join(" · ") };
}

// ── 위험 점검 (D) ───────────────────────────────────────────

/** 같은 시점의 표준약관 비율 (%). 환불(0)~50 */
function standardPercentAt(daysBefore: number): number {
  const t = STANDARD_TIERS.find((s) => daysBefore >= s.daysBefore) ?? STANDARD_TIERS[STANDARD_TIERS.length - 1];
  return t.kind === "refund" ? 0 : t.value;
}

/** 구간이 여행요금의 몇 %쯤인가 (예약금은 10%, 고정 금액은 1인 요금 대비) */
function tierPercent(t: CancelTier, perPerson: number): number {
  if (t.kind === "refund") return 0;
  if (t.kind === "deposit") return 10;
  if (t.kind === "fixed") return perPerson > 0 ? (t.value / perPerson) * 100 : 0;
  if (t.kind === "percent") return t.value;
  return 100;
}

export function policyRisks(policy: CancelPolicy, o: { departureDate?: string; perPerson?: number; holidays?: ReadonlySet<string> } = {}): string[] {
  if (policy.mode === "standard") return [];
  const out: string[] = [];
  const above = policy.tiers.filter((t) => tierPercent(t, o.perPerson ?? 0) > standardPercentAt(t.daysBefore) + 0.5);
  if (above.length > 0 && !policy.reason)
    out.push("표준약관보다 높은 취소료 구간이 있는데 사유(선납·전세기·개런티 등)가 없습니다 — 특별약관은 실제 손해 범위 안에서만 인정됩니다.");
  const over50 = policy.tiers.filter((t) => tierPercent(t, o.perPerson ?? 0) > 50);
  if (over50.length > 0)
    out.push(`50%를 넘는 구간(${over50.map((t) => chargeText(t)).join(", ")})은 분쟁 때 조정될 수 있습니다 (표준약관 최고 50%, 소비자원은 특별약관 80%를 30%로 조정한 사례). 실제 손해 증빙을 갖춰 두세요.`);
  if (policy.guaranteeNote.trim() && policy.guaranteeFee === 0) out.push("개런티 예약 취소료의 금액이 없습니다 — 계약 때 금액을 적어야 동의 요건을 채웁니다.");
  if (policy.businessDays && o.departureDate) {
    const free = freeCancelDeadline(cancelSchedule(policy, o.departureDate, o.departureDate, o.holidays));
    if (free && free.deadline !== free.date)
      out.push(`무료 취소 마감일 ${dateLabel(free.date)}이 휴일이라 실제 마감은 ${dateLabel(free.deadline)} ${policy.businessEnd}입니다 — 고객 안내에 실제 마감을 함께 적습니다(자동 표시).`);
  }
  return out;
}

/** 특별약관이면 계약서·일정표에 함께 붙이는 고지 (실제 손해·근거 제시 — 공정위 시정 요건) */
export function policyDisclosure(policy: CancelPolicy): string[] {
  if (policy.mode === "standard") return ["국외여행 표준약관 및 소비자분쟁해결기준에 따릅니다 (여행개시일 기준)."];
  const lines = [
    `이 상품은 국외여행 표준약관과 달리 특별약관의 취소수수료가 적용되며, 계약 때 별도로 동의를 받습니다${policy.reason ? ` (사유: ${REASON_LABEL[policy.reason]})` : ""}.`,
    "여행자가 요청하면 여행사는 취소수수료 산정 근거(공급업체 취소 규정·영수증 등)를 제시하며, 실제 손해보다 많이 받은 금액은 돌려드립니다.",
  ];
  if (policy.businessDays) lines.push(`취소 기준일은 취소를 통지한 날이며, 영업일(월~금 ${policy.businessEnd}까지, 공휴일 제외) 기준입니다. 영업시간 밖·휴일 통지는 다음 영업일 접수로 봅니다.`);
  if (policy.guaranteeFee > 0) lines.push(`개런티(확정) 예약: 기간과 관계없이 1인 ${formatMoney(policy.guaranteeFee, "KRW")} 이상의 취소료가 있습니다${policy.guaranteeNote.trim() ? ` — ${policy.guaranteeNote.trim()}` : ""}.`);
  return lines;
}
