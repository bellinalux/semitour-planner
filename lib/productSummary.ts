import { dayWindow, isTourItem } from "@/lib/feasibility";
import { dayIntensity } from "@/lib/intensity";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { isShoppingCenter, type PackageRules } from "@/lib/packageRules";
import type { DayPlan } from "@/types";

/**
 * 상품 요약 지표 — 하루 평균 장소 수, 하루 평균 걷기, 자유시간 비중, 특식, 쇼핑센터.
 * 상품 규칙(등급 약속)과 견줘 벗어나면 표시한다 (ok false).
 */
export interface SummaryChip {
  label: string;
  value: string;
  ok: boolean;
  hint: string;
}

const SPECIAL = /특식|씨푸드|해산물|랍스터|스테이크|코스|뷔페|BBQ|바비큐|샤브|수끼|훠궈|미쉐린|파인\s*다이닝|선상\s*디너|디너\s*크루즈|가이세키|와규|킹크랩|대게|무제한|정식/i;

export function productSummary(days: DayPlan[], pmChoice: PmChoice, r: PackageRules): SummaryChip[] {
  const tourDays = days.filter((d) => ["normal", "rest", "arrival-morning", "departure"].includes(dayWindow(d, pmChoice, r.dayEnd).kind) && dayItems(d, pmChoice).some(isTourItem));
  const n = Math.max(1, tourDays.length);
  const places = tourDays.reduce((s, d) => s + dayItems(d, pmChoice).filter((i) => isTourItem(i) && i.type !== "meal").length, 0) / n;
  const km = tourDays.reduce((s, d) => s + dayIntensity(d, pmChoice).km, 0) / n;
  const free = tourDays.reduce((s, d) => s + (d.rest === "free" ? 1 : d.rest === "pmfree" || d.rest === "late" || d.kind === "semi" ? 0.5 : 0), 0) / n;
  const all = days.flatMap((d) => dayItems(d, pmChoice));
  const special = all.filter((i) => i.type === "meal" && SPECIAL.test(`${i.name} ${i.cuisine ?? ""} ${i.description ?? ""}`)).length;
  const shops = all.filter(isShoppingCenter).length;
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return [
    { label: "하루 평균", value: `${round1(places)}곳`, ok: r.placesPerDay[1] === 0 || places <= r.placesPerDay[1], hint: `기준 ${r.placesPerDay[0]}~${r.placesPerDay[1]}곳` },
    { label: "걷기", value: `하루 약 ${round1(km)}km`, ok: !r.walkKmMax || km <= r.walkKmMax, hint: r.walkKmMax ? `기준 하루 ${r.walkKmMax}km 이내` : "걷기 기준 없음" },
    { label: "자유시간", value: `${Math.round(free * 100)}%`, ok: free >= r.freeShare[0] - 0.001 && free <= r.freeShare[1] + 0.001, hint: `기준 ${Math.round(r.freeShare[0] * 100)}~${Math.round(r.freeShare[1] * 100)}%` },
    { label: "특식", value: `${special}회`, ok: special >= r.specialMealsMin, hint: `기준 ${r.specialMealsMin}회 이상` },
    { label: "쇼핑센터", value: shops === 0 ? "없음 (노쇼핑)" : `${shops}회`, ok: r.shoppingMax === null || shops <= r.shoppingMax, hint: r.shoppingMax === null ? "제한 없음 (하루 1회)" : r.shoppingMax === 0 ? "노쇼핑 등급" : `최대 ${r.shoppingMax}회` },
  ];
}
