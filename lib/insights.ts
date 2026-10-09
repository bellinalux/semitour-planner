import { budgetPlan } from "@/lib/budget";
import { describeAction, type FitPlan, type Upgrade } from "@/lib/budgetFit";
import { ourPolicy } from "@/lib/competitorDiff";
import { calcDayLoad } from "@/lib/dayLoad";
import { formatDuration } from "@/lib/format";
import { flightMismatches, knownFlight } from "@/lib/flightRepair";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { buildPriceTiers, documentQuote } from "@/lib/pricing";
import { setupChecklist, type SetupSection } from "@/lib/setupChecklist";
import { supplierCuts, supplierTarget } from "@/lib/supplierCheck";
import { subjectParticle, verifySupplierQuote } from "@/lib/supplierVerify";
import { buildTourCompare } from "@/lib/tourCompare";
import type { CourseMeta, DayPlan, QuoteResult, TripInput } from "@/types";

/**
 * 레이아웃3(요약·추천) — 지금 견적의 핵심 숫자와, 고치면 좋은 것을 중요한 순서로 모은다.
 * 화면에서 버튼으로 바로 적용할 수 있게 각 추천에 할 일(action)을 붙인다. 계산은 기존 견적·예산·업체 검증 로직을 그대로 쓴다.
 */

export interface KeyNumbers {
  pricePerPerson: number;
  costPerPerson: number;
  profitPerPerson: number;
  marginRate: number;
  /** 가격 기준 설명 (예: "판매가 · 클룩", "권장 판매가") */
  priceLabel: string;
  /** 상태 한 줄들 (예산·공급가 상한·경쟁 상품 위치) */
  status: { text: string; tone: "good" | "warn" | "info" }[];
}

export type InsightAction =
  | { kind: "focus"; section: SetupSection; label: string }
  | { kind: "scroll"; target: string; label: string }
  | { kind: "budget-apply"; label: string }
  | { kind: "budget-undo"; label: string }
  | { kind: "upgrade"; upgrade: Upgrade; label: string }
  | { kind: "copy"; text: string; label: string }
  | { kind: "fix-flight"; label: string };

export interface Insight {
  id: string;
  tone: "warn" | "info" | "good";
  title: string;
  detail?: string;
  action?: InsightAction;
}

export interface InsightInput {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  meta: CourseMeta | null;
  quote: QuoteResult | null;
  /** 예산 맞추기 (판매가·도매가에서 시작한 견적) */
  budgetFit: { plan: FitPlan | null; upgrades: Upgrade[]; applied: string[] } | null;
  money: (v: number) => string;
}

export function keyNumbers({ input, days, pmChoice, meta, quote, money }: InsightInput): KeyNumbers | null {
  if (!quote?.ok) return null;
  const q = documentQuote(quote, input);
  const s = q.scenario;
  const channel = input.channels.find((c) => c.id === input.documentChannelId)?.name.trim();
  const status: KeyNumbers["status"] = [];

  const plan = budgetPlan(input, quote, quote.groundDays);
  if (plan && plan.gap !== null) {
    status.push(
      plan.gap >= 0 ? { text: `예산 안 — 1인 ${money(plan.gap)} 남음`, tone: "good" } : { text: `예산 초과 — 1인 ${money(-plan.gap)} 넘음`, tone: "warn" },
    );
  }

  const policy = ourPolicy(days, pmChoice, input, meta);
  const tiers = buildPriceTiers(quote, input, policy);
  const target = supplierTarget(input, quote, tiers.stats?.p25 ?? null);
  if (target) {
    status.push(
      target.over <= 0
        ? { text: `업체 공급가 상한 안 — 수익률 약 ${target.marginAtCurrent.toFixed(1)}%`, tone: "good" }
        : target.supplierPerPerson > target.breakEvenSupplierPerPerson
          ? { text: `업체 공급가로는 적자 — 상한보다 1인 ${money(target.over)} 높음`, tone: "warn" }
          : { text: `업체 공급가가 상한보다 1인 ${money(target.over)} 높음 (수익률 ${target.marginAtCurrent.toFixed(1)}%)`, tone: "warn" },
    );
  }

  const compare = buildTourCompare(input, days, pmChoice, quote, meta);
  if (compare && !compare.position.includes("모릅니다")) status.push({ text: compare.position, tone: "info" });

  return {
    pricePerPerson: s.pricePerPerson,
    costPerPerson: s.costPerPerson,
    profitPerPerson: s.profit / Math.max(1, s.travelers),
    marginRate: s.actualMarginRate,
    priceLabel: channel ? `판매가 · ${channel}` : input.pricingMode === "target_margin" ? "권장 판매가" : "판매가",
    status,
  };
}

const TONE_ORDER = { warn: 0, info: 1, good: 2 } as const;

export function buildInsights({ input, days, pmChoice, meta, quote, budgetFit, money }: InsightInput): Insight[] {
  const out: Insight[] = [];

  if (quote && !quote.ok)
    out.push({
      id: "quote-error",
      tone: "warn",
      title: "견적을 계산할 수 없습니다",
      detail: quote.error,
      action: { kind: "focus", section: "pricing", label: "가격 방식 열기" },
    });

  // ① 비어 있는 원가
  for (const item of setupChecklist(input)) {
    if (item.done) continue;
    const isDoc = item.section === "documents";
    out.push({
      id: `missing-${item.label}`,
      tone: isDoc ? "info" : "warn",
      title: `${item.label}${subjectParticle(item.label)} 비어 있습니다`,
      detail: isDoc ? "견적서·청구서에 들어갈 수신처입니다" : "자동 구성이 시세로 채우거나, 아는 값을 직접 넣으세요",
      action: { kind: "focus", section: item.section, label: "입력에서 채우기" },
    });
  }

  // ② 예산 맞추기 (판매가·도매가에서 시작)
  if (budgetFit) {
    if (budgetFit.applied.length > 0) {
      out.push({
        id: "budget-applied",
        tone: "good",
        title: "예산에 맞춰 바꿨습니다",
        detail: budgetFit.applied.join(" · "),
        action: { kind: "budget-undo", label: "되돌리기" },
      });
    } else if (budgetFit.plan) {
      const p = budgetFit.plan;
      out.push({
        id: "budget-over",
        tone: "warn",
        title: `예산 1인 ${money(p.deficit)} 초과 — 줄일 것 ${p.actions.length}개`,
        detail: p.actions.map((a) => describeAction(a, money)).join(" · ") || "줄일 수 있는 항목이 없습니다. 판매가를 올리거나 원가를 직접 낮추세요",
        action: p.actions.length > 0 ? { kind: "budget-apply", label: p.enough ? "한 번에 줄이기" : "줄일 수 있는 만큼 줄이기" } : undefined,
      });
    }
    for (const u of budgetFit.upgrades.slice(0, 2)) {
      const name = u.kind === "hotel" ? `${u.city} 숙소를 ${u.hotel.name}(으)로` : `${u.tour.name} 판매가에 포함`;
      out.push({
        id: `upgrade-${name}`,
        tone: "info",
        title: `예산이 남습니다 — ${name}`,
        detail: `1인 +${money(u.extraPerPerson)}`,
        action: { kind: "upgrade", upgrade: u, label: "올리기" },
      });
    }
  }

  // ③ 업체 견적 (공급가 방식이거나 견적서를 읽었을 때)
  if (quote?.ok && (input.pricingMode === "supplier" || input.supplierQuote)) {
    const policy = ourPolicy(days, pmChoice, input, meta);
    const tiers = buildPriceTiers(quote, input, policy);
    const target = supplierTarget(input, quote, tiers.stats?.p25 ?? null);
    if (target && target.over > 0) {
      const cuts = supplierCuts(input, days, pmChoice, meta, target.over).filter((c) => c.recommended);
      out.push({
        id: "supplier-over",
        tone: "warn",
        title: `업체 공급가를 1인 ${money(target.over)} 낮춰야 합니다`,
        detail: cuts.length > 0 ? `빼거나 바꾸면 좋은 것 ${cuts.length}개: ${cuts.map((c) => c.name).join(", ")}` : "업체에 공급가 조정을 요청하세요",
        action: { kind: "scroll", target: "supplier-check", label: "업체 견적 검증 보기" },
      });
    }
    const verify = verifySupplierQuote(input, days, pmChoice, quote);
    for (const issue of verify.calcIssues.slice(0, 2))
      out.push({ id: `supplier-issue-${issue.slice(0, 30)}`, tone: "warn", title: "업체 견적 확인 필요", detail: issue });
    if (verify.questions.length > 0) {
      out.push({
        id: "supplier-questions",
        tone: "info",
        title: `업체에 물어볼 것 ${verify.questions.length}개`,
        detail: verify.questions.slice(0, 2).join(" / ") + (verify.questions.length > 2 ? " …" : ""),
        action: { kind: "copy", text: verify.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"), label: "질문 복사" },
      });
    }
  }

  // ④ 일정이 너무 긴 날
  for (const day of days) {
    const load = calcDayLoad(day, pmChoice);
    if (load.level !== "overloaded") continue;
    out.push({
      id: `day-${day.day}`,
      tone: "warn",
      title: `DAY ${day.day} 일정이 너무 깁니다`,
      detail: `체류 ${formatDuration(load.stayMinutes)} + 이동 ${formatDuration(load.travelMinutes)} — 항목을 줄이거나 코스 엔진 점검으로 순서를 고치세요`,
      action: { kind: "scroll", target: `day-${day.day}`, label: "일정 보기" },
    });
  }

  // ⑤ 확인된 항공편(고른 항공편·원문 시각)과 일정표의 항공 시각이 다르면 한 번에 맞추기
  const mismatches = flightMismatches(days, knownFlight(days, input, meta));
  if (mismatches.length > 0) {
    out.push({
      id: "flight-mismatch",
      tone: "warn",
      title: "항공 시각이 확인된 항공편과 다릅니다",
      detail: mismatches.join(" / "),
      action: { kind: "fix-flight", label: "항공 시각 맞추기" },
    });
  }

  // ⑥ 비행 시간이 비었거나 너무 짧은 날 (검증되지 않은 시각으로 일정이 짜이지 않게) — 맞출 항공편이 있으면 위에서 처리
  for (const day of mismatches.length > 0 ? [] : days) {
    const items = dayItems(day, pmChoice);
    items.forEach((item, i) => {
      if (item.type !== "flight" || i === items.length - 1) return;
      const departure = item.name.includes("출발") || items[i + 1]?.type === "flight";
      if (!departure) return;
      const minutes = item.travelMinutesToNext ?? 0;
      if (minutes >= 50) return;
      out.push({
        id: `flight-${day.day}-${item.id}`,
        tone: minutes > 0 ? "warn" : "info",
        title: minutes > 0 ? `DAY ${day.day} 비행 시간이 ${minutes}분으로 되어 있습니다` : `DAY ${day.day} 비행 시간을 아직 모릅니다`,
        detail: "항공편을 고르거나(2. 상품 구성) 업체 코스표의 출발·도착 시각을 확인하면 실제 시각으로 일정을 맞춥니다",
        action: { kind: "scroll", target: `day-${day.day}`, label: "일정 보기" },
      });
    });
  }

  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}
