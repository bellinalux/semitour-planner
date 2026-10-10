import { dayItems, type PmChoice } from "@/lib/itinerary";
import { dayMealIssues } from "@/lib/courseFit";
import { needsCheck } from "@/lib/needsCheck";
import { paceIssues } from "@/lib/pace";
import { hotelPins, regionRepeats } from "@/lib/regionPlan";
import type { CostKey, DayPlan, TripInput } from "@/types";

/**
 * 일정표 품질 점수 (100점) — 지금 일정이 얼마나 확인됐고 업계 기준에 맞는지 한 숫자로 본다.
 *  근거 20 · 동선 20 · 일정 강도 15 · 고객 니즈 15 · 원가 확인 20 · 시간 확인 10
 * 항목마다 "무엇을 하면 오르나"를 같이 준다. AI를 쓰지 않는다 (이미 한 점검 결과만 모은다).
 */

export interface QualityPart {
  key: "reason" | "route" | "pace" | "needs" | "cost" | "time";
  label: string;
  score: number;
  max: number;
  note: string;
  /** 올리는 방법 (없으면 만점) */
  fix?: string;
  /** 고치러 갈 화면 */
  anchor?: string;
}

export interface Quality {
  total: number;
  parts: QualityPart[];
}

const TOUR = (type: string | undefined) => !["flight", "transfer", "hotel", "free_time", "meal"].includes(type ?? "sightseeing");
const r1 = (v: number) => Math.round(v * 10) / 10;

export function itineraryQuality(input: TripInput, days: DayPlan[], pmChoice: PmChoice, engineScores: number[] = []): Quality {
  const places = days.flatMap((d) => dayItems(d, pmChoice)).filter((i) => TOUR(i.type));
  const n = Math.max(1, places.length);
  const parts: QualityPart[] = [];

  // 근거: 지식 창고 근거가 붙은 장소 비율
  const withReason = places.filter((i) => i.reason).length;
  const reason = r1((withReason / n) * 20);
  parts.push({
    key: "reason",
    label: "코스 근거",
    score: reason,
    max: 20,
    note: `장소 ${places.length}곳 중 ${withReason}곳이 지식 창고 근거(인기·여행사·우리 고객) 있음`,
    ...(reason < 20 ? { fix: "AI 일정을 다시 만들거나 지식 창고에서 이 도시를 조사하면 근거가 붙습니다", anchor: "itinerary" } : {}),
  });

  // 동선: 코스 점검 평균(12) + 지역 반복 없음(4) + 좌표(4)
  const pins = hotelPins(input.selectedHotels);
  const avg = engineScores.length ? engineScores.reduce((s, x) => s + x, 0) / engineScores.length : null;
  const repeats = regionRepeats(days, pmChoice, pins).length;
  const coordShare = places.filter((i) => typeof i.lat === "number").length / n;
  const route = r1((avg !== null ? (avg / 100) * 12 : 0) + Math.max(0, 4 - repeats * 2) + coordShare * 4);
  parts.push({
    key: "route",
    label: "동선",
    score: route,
    max: 20,
    note: `${avg !== null ? `코스 점검 평균 ${Math.round(avg)}점` : "코스 점검 전"} · 반복 지역 ${repeats}곳 · 좌표 ${Math.round(coordShare * 100)}%`,
    ...(route < 20
      ? { fix: avg === null ? "코스 점검(좌표 찾기)을 하면 동선 점수가 매겨집니다" : repeats > 0 ? "코스 지도의 '여러 날 지역 묶기'를 적용하세요" : "코스 점검의 추천 순서를 적용하세요", anchor: "course-map" }
      : {}),
  });

  // 일정 강도: 힘든 날 다음 날 문제 1건마다 −5
  const pi = paceIssues(days, pmChoice, input.pace).length;
  const pace = Math.max(0, 15 - pi * 5);
  parts.push({ key: "pace", label: "일정 강도", score: pace, max: 15, note: pi ? `쉬는 날 점검 ${pi}건` : "힘든 날 다음 날도 무리 없음", ...(pi ? { fix: "일정 강도 칸의 늦은 출발·오후 자유를 적용하세요", anchor: "pace" } : {}) });

  // 고객 니즈: 요청 정보가 없으면 10점 (요청을 넣으면 확인 가능)
  const need = needsCheck(input, days, pmChoice);
  const asked = need.length > 0;
  const ok = need.filter((x) => x.tone === "ok").length;
  const warn = need.filter((x) => x.tone === "warn").length;
  const info = need.filter((x) => x.tone === "info").length;
  const needs = asked ? r1(Math.max(0, (ok + warn > 0 ? (15 * ok) / (ok + warn) : 15) - info)) : 10;
  parts.push({
    key: "needs",
    label: "고객 니즈",
    score: needs,
    max: 15,
    note: asked ? `맞춤 ${ok} · 못 맞춤 ${warn}${info ? ` · 참고 ${info}` : ""}` : "동반자·꼭 넣을 것·피할 것이 비어 있음",
    ...(needs < 15 ? { fix: asked ? "고객 니즈 점검에서 못 맞춘 것을 고치세요" : "입력의 '일정 상세 조건'에 동반자·꼭 넣을 것·피할 것을 넣으세요", anchor: asked ? "pace" : "detail-conditions" } : {}),
  });

  // 원가 확인: 쓰는 항목마다 확정 1 · 웹/요금표/지난 견적 0.6 · AI 추정 0.4 · 미정 0
  const keys: CostKey[] = [
    ...(input.vehicleCostPerDay > 0 ? (["vehicle"] as CostKey[]) : []),
    ...(input.guideCostPerDay > 0 ? (["guide"] as CostKey[]) : []),
    ...(input.packageType !== "land" || input.lodgingRatePerNight > 0 || Object.keys(input.selectedHotels).length > 0 ? (["lodging"] as CostKey[]) : []),
    ...(input.packageType === "full" ? (["flight"] as CostKey[]) : []),
  ];
  const certainty = (k: CostKey) => {
    const st = input.costStatus[k];
    if (st === "confirmed") return 1;
    if (st === "undecided") return 0;
    const src = input.costSource[k]?.kind;
    return src === "ai" ? 0.4 : src ? 0.6 : 0.4;
  };
  const cost = keys.length ? r1((keys.reduce((s, k) => s + certainty(k), 0) / keys.length) * 20) : (input.pricingMode === "supplier" ? 20 : 10);
  const conf = keys.filter((k) => input.costStatus[k] === "confirmed").length;
  parts.push({
    key: "cost",
    label: "원가 확인",
    score: cost,
    max: 20,
    note: keys.length ? `원가 ${keys.length}항목 중 확정 ${conf}` : input.pricingMode === "supplier" ? "업체 공급가로 견적" : "원가 항목이 비어 있음",
    ...(cost < 20 ? { fix: "업체 견적을 받으면 확정, 요금표·웹 시세로 채우면 점수가 오릅니다 (견적 칸에서 확정 표시)", anchor: "supplier-check" } : {}),
  });

  // 시간 확인: 웹·현장으로 체류 시간을 확인한 장소 비율 − 식사 시간 문제 1건마다 2점
  const timed = places.filter((i) => i.timeCheck || i.stayEdited).length;
  const mealProblems = days.reduce((s, d) => s + dayMealIssues(d, pmChoice).length, 0);
  const time = r1(Math.max(0, (timed / n) * 10 - mealProblems * 2));
  parts.push({
    key: "time",
    label: "시간 확인",
    score: time,
    max: 10,
    note: `장소 ${places.length}곳 중 ${timed}곳 체류 시간 확인${mealProblems ? ` · 식사 시간 문제 ${mealProblems}건` : ""}`,
    ...(time < 10 ? { fix: mealProblems ? "일정 카드의 [식사 시간 맞추기]를 누르세요" : "일정 카드의 '시간 검증'(구역 단위 웹 확인)을 하세요", anchor: "itinerary" } : {}),
  });

  return { total: Math.round(parts.reduce((s, p) => s + p.score, 0)), parts };
}
