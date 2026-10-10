import { budgetPlan } from "@/lib/budget";
import { describeAction, type FitPlan, type Upgrade } from "@/lib/budgetFit";
import { ourPolicy } from "@/lib/competitorDiff";
import { lastPriceChange } from "@/lib/competitors";
import type { DayMove } from "@/lib/dayBalance";
import { calcDayLoad } from "@/lib/dayLoad";
import { formatDuration } from "@/lib/format";
import { FX_ALERT_PCT, type FxDrift } from "@/lib/fxDrift";
import type { SeasonResponse } from "@/lib/schemas/season";
import { flightMismatches, knownFlight } from "@/lib/flightRepair";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { buildPriceTiers, documentQuote } from "@/lib/pricing";
import { setupChecklist, type SetupSection } from "@/lib/setupChecklist";
import { supplierCuts, supplierTarget } from "@/lib/supplierCheck";
import { subjectParticle, verifySupplierQuote } from "@/lib/supplierVerify";
import { buildTourCompare } from "@/lib/tourCompare";
import { unconfirmedCosts } from "@/lib/printChecks";
import type { CostKey, CourseMeta, DayPlan, QuoteResult, TripInput } from "@/types";

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
  | { kind: "fix-flight"; label: string }
  | { kind: "fix-day-time"; days: number[]; label: string }
  | { kind: "engine-move"; move: DayMove; label: string }
  | { kind: "group-areas"; day: number; label: string }
  | { kind: "find-competitors"; label: string }
  | { kind: "confirm-costs"; keys: CostKey[]; label: string }
  | { kind: "apply-fx"; label: string };

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
  /** 코스 엔진 점수(점검한 날)와 날짜 사이 옮기기 제안 */
  engine?: {
    scores: Record<number, { score: number; grade: string; top: string; best: number }>;
    moves: DayMove[];
    /** 떠났던 구역으로 되돌아오는 날 */
    zigzags?: Record<number, { area: string; from: string }[]>;
    zigzagFixable?: Record<number, boolean>;
  };
  /** 외화 업체 견적의 환율 변동 */
  fx?: FxDrift | null;
  /** 출발 시기 확인 (날씨·공휴일·축제·휴관·혼잡) */
  season?: SeasonResponse | null;
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

export function buildInsights({ input, days, pmChoice, meta, quote, budgetFit, money, engine, fx, season }: InsightInput): Insight[] {
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

  // 출발 시기 (날씨·현지 공휴일·축제·휴관·성수기) — 영향이 큰 것은 하나씩, 참고는 묶어서
  if (season && (season.notes.length > 0 || season.weather)) {
    const notice = [
      `[${input.destination} 출발 시기 안내]`,
      ...(season.weather ? [`· 날씨: ${season.weather}`] : []),
      ...season.notes.map((n) => `· ${n.dates ? `${n.dates} ` : ""}${n.title} — ${n.detail}`),
    ].join("\n");
    const copy = { kind: "copy" as const, text: notice, label: "고객 안내 문구 복사" };
    for (const n of season.notes.filter((x) => x.severity === "warn").slice(0, 3))
      out.push({ id: `season-${n.title}`, tone: "warn", title: `출발 시기: ${n.title}`, detail: `${n.dates ? `${n.dates} · ` : ""}${n.detail}`, action: copy });
    const infos = season.notes.filter((x) => x.severity === "info");
    if (infos.length > 0 || season.weather)
      out.push({
        id: "season-info",
        tone: "info",
        title: `출발 시기 참고${infos.length > 0 ? ` ${infos.length}건` : ""}`,
        detail: [season.weather, ...infos.map((n) => `${n.dates ? `${n.dates} ` : ""}${n.title}`)].filter(Boolean).join(" · "),
        action: copy,
      });
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
    // 환율 변동 (외화 업체 견적) — 오르면 같은 외화 요금이 비싸져 마진이 준다
    if (fx && Math.abs(fx.changePct) >= FX_ALERT_PCT) {
      const up = fx.changePct > 0;
      const rate = (v: number) => (v >= 100 ? v.toFixed(1) : v.toFixed(4).replace(/0+$/, ""));
      out.push({
        id: "fx-drift",
        tone: up ? "warn" : "info",
        title: `환율이 견적 받을 때보다 ${Math.abs(fx.changePct).toFixed(1)}% ${up ? "올랐습니다" : "내렸습니다"} (${fx.code} ${rate(fx.quoted)} → ${rate(fx.current)})`,
        detail: `업체 공급가 1인 ${money(fx.priceThen)} → ${money(fx.priceNow)} (${up ? "+" : "−"}${money(Math.abs(fx.priceNow - fx.priceThen))}). ${up ? "업체에 원화 확정 요금을 받거나 지금 환율로 다시 계산하세요." : "지금 환율로 다시 계산하면 원가가 줄어듭니다."}`,
        action: { kind: "apply-fx", label: "지금 환율로 다시 계산" },
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
    // 구역 단위로 이미 확인한 날이면 시간이 아니라 일정 자체가 많은 것 → 항목을 줄이도록 안내
    const checked = dayItems(day, pmChoice).some((i) => i.timeCheck?.basis === "area");
    // 확인한 시간으로도 길면, 여유 있는 날로 옮길 묶음이 있으면 바로 옮기게 한다
    const move = checked ? engine?.moves.find((m) => m.fromDay === day.day) : undefined;
    out.push({
      id: `day-${day.day}`,
      tone: "warn",
      title: `DAY ${day.day} 일정이 너무 깁니다 (체류+이동 ${formatDuration(load.totalMinutes)})`,
      detail: move
        ? `웹에서 확인한 시간으로도 ${formatDuration(load.totalMinutes)}입니다 — ${move.label}${move.note ? ` (${move.note})` : ""}`
        : checked
          ? `웹에서 확인한 시간으로도 ${formatDuration(load.totalMinutes)}입니다 — 항목을 다른 날로 옮기거나 선택 옵션으로 빼세요`
          : `체류 ${formatDuration(load.stayMinutes)} + 이동 ${formatDuration(load.travelMinutes)} — 장소마다 따로 잡은 시간이라 부풀었을 수 있습니다. 하루 순서를 웹에서 구역 단위로 확인해 맞춥니다`,
      action: move
        ? { kind: "engine-move", move, label: `DAY ${move.toDay}로 옮기기` }
        : checked
          ? { kind: "scroll", target: `day-${day.day}`, label: "일정 보기" }
          : { kind: "fix-day-time", days: [day.day], label: "일정 시간 검증으로 맞추기" },
    });
  }

  // ④-1 지그재그 동선 — 떠났던 구역으로 되돌아오는 날 (복귀 이동·식사·밤 일정은 제외)
  for (const [k, zig] of Object.entries(engine?.zigzags ?? {})) {
    if (zig.length === 0) continue;
    out.push({
      id: `zigzag-${k}`,
      tone: "warn",
      title: `DAY ${k} 동선이 지그재그입니다`,
      ...(engine?.zigzagFixable?.[Number(k)] === false
        ? {
            detail: `${zig.map((z) => `${z.from} → ${z.area}로 되돌아옴`).join(", ")} — 식당 위치 때문입니다. 일정 카드에서 그 지역 안 식당으로 바꾸거나, 코스 엔진 점검으로 순서를 맞추세요`,
            action: { kind: "scroll" as const, target: `day-${k}`, label: "일정 카드 보기" },
          }
        : {
            detail: `${zig.map((z) => `${z.from} → ${z.area}로 되돌아옴`).join(", ")} — 구역을 한 방향으로 돌도록 같은 지역 장소를 붙입니다 (식사·밤 일정·숙소 복귀는 제자리)`,
            action: { kind: "group-areas" as const, day: Number(k), label: "구역 순서대로 묶기" },
          }),
    });
  }

  // ④-2 코스 엔진 점수가 낮은 날 (85점 미만) — 가장 큰 감점 이유와 엔진 추천 점수
  for (const day of days) {
    const sc = engine?.scores[day.day];
    if (!sc || sc.score >= 85) continue;
    out.push({
      id: `engine-${day.day}`,
      tone: sc.score < 70 ? "warn" : "info",
      title: `DAY ${day.day} 코스 점수 ${sc.score}점 (${sc.grade})`,
      detail: [sc.top, sc.best > sc.score ? `엔진 추천대로 고치면 ${sc.best}점` : ""].filter(Boolean).join(" · ") || undefined,
      action: { kind: "scroll", target: "course-engine", label: "100점 만들기 보기" },
    });
  }

  // ④-0 판매가에 들어간 추정 원가 — 업체·시세를 확인한 뒤 "확인함"으로 (인쇄 전 확인 창을 줄인다)
  const estimatedCosts = quote?.ok ? unconfirmedCosts(quote) : [];
  if (estimatedCosts.length > 0)
    out.push({
      id: "estimated-costs",
      tone: "info",
      title: `확인 안 한 추정 원가 ${estimatedCosts.length}개 — 판매가가 이 값으로 정해졌습니다`,
      detail: estimatedCosts.map((c) => `${c.label} ${money(c.amount)}${c.from ? ` (${c.from})` : ""}`).join(" · "),
      action: { kind: "confirm-costs", keys: estimatedCosts.map((c) => c.key), label: "확인했어요 (확인함으로)" },
    });

  // ④-2b 경쟁 상품 가격이 바뀌었으면 (다시 조회해서)
  const changes = input.competitors.flatMap((c) => {
    const ch = lastPriceChange(c);
    return ch ? [{ name: c.name, ...ch }] : [];
  });
  if (changes.length > 0)
    out.push({
      id: "competitor-price-change",
      tone: "info",
      title: `경쟁 상품 가격 변동 ${changes.length}건`,
      detail: changes.map((c) => `${c.name.slice(0, 20)} ${c.diff > 0 ? "▲" : "▼"}${money(Math.abs(c.diff))}`).join(" · "),
      action: { kind: "scroll", target: "tour-compare", label: "투어 비교표 보기" },
    });

  // ④-3 타업체 비교 — 아직 경쟁 상품이 없으면 찾아 비교하게, 있으면 우리가 나은 점 / 경쟁 상품이 나은 점 (투어 비교표 요약)
  if (quote?.ok && input.competitors.length === 0 && input.destination.trim() && days.length > 0) {
    out.push({
      id: "find-competitors",
      tone: "info",
      title: "타업체 상품과 아직 비교하지 않았습니다",
      detail: "같은 여행지·기간의 대형 여행사 상품을 찾아 같은 조건 판매가·코스·우리가 나은 점을 비교합니다",
      action: { kind: "find-competitors", label: "타업체 찾아 비교" },
    });
  }
  const compare = quote?.ok ? buildTourCompare(input, days, pmChoice, quote, meta) : null;
  if (compare && (compare.summary.strengths.length > 0 || compare.summary.weaknesses.length > 0)) {
    const { strengths, weaknesses } = compare.summary;
    out.push({
      id: "tour-compare",
      tone: weaknesses.length > strengths.length ? "warn" : "info",
      title: `타업체 ${compare.columns.length - 1}곳 비교 — 우리가 나은 점 ${strengths.length}개 · 경쟁 상품이 나은 점 ${weaknesses.length}개`,
      detail: [strengths[0] && `강점: ${strengths[0]}`, weaknesses[0] && `보완: ${weaknesses[0]}`].filter(Boolean).join(" / "),
      action: { kind: "scroll", target: "tour-compare", label: "투어 비교표 보기" },
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

  // 같은 무게면 넣은 순서대로, 문서 수신처 같은 서류 준비는 맨 뒤
  const last = (i: Insight) => (i.action?.kind === "focus" && i.action.section === "documents" ? 1 : 0);
  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || last(a) - last(b));
}
