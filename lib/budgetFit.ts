import { midpoint } from "@/lib/travelEstimate";
import type { BudgetPlan } from "@/lib/budget";
import { dayItems, overnightNights, type PmChoice } from "@/lib/itinerary";
import { DEFAULT_MIN_PARTICIPANTS, DEFAULT_PARTICIPATION_RATE, suggestOptionPrice } from "@/lib/options";
import { samePlace } from "@/lib/places";
import type { CourseMeta, DayPlan, HotelCandidate, ItineraryItem, TourCandidate, TourOption, TripInput } from "@/types";

/**
 * 예산 맞추기 — 판매가(도매가)에서 시작한 견적의 1인 원가가 예산을 넘으면 줄일 방법을, 남으면 올릴 방법을 고른다.
 * 줄이는 순서: ① 유료 체험·입장을 선택 옵션으로 돌리기(고객이 원하면 따로 신청) → ② 숙소를 한 단계 싼 후보로
 * → ③ 그래도 모자랄 때만 대표 일정(상품명·하이라이트에 들어간 곳)을 선택 옵션으로.
 * 한 가지로 모자라는 만큼을 채울 수 있으면 그중 가장 작은 변경을, 아니면 큰 것부터 차례로 고른다.
 */

export type FitAction =
  | { kind: "to-option"; itemId: string; dayNo: number; name: string; savingPerPerson: number; signature?: boolean }
  | { kind: "hotel"; city: string; hotel: HotelCandidate; rate: number; fromName: string; savingPerPerson: number };

export interface FitPlan {
  /** 줄여야 하는 1인 금액 */
  deficit: number;
  actions: FitAction[];
  /** 이대로 바꾼 뒤 남는(+)·모자라는(−) 1인 금액 */
  gapAfter: number;
  enough: boolean;
}

export type Upgrade =
  | { kind: "hotel"; city: string; hotel: HotelCandidate; rate: number; extraPerPerson: number }
  | { kind: "tour"; tour: TourCandidate; extraPerPerson: number };

export interface HotelChoiceLike {
  city: string;
  candidates: HotelCandidate[];
  picked: { hotel: HotelCandidate; rate: number } | null;
}

const rateOf = (h: HotelCandidate) => midpoint(h.nightlyLow, h.nightlyHigh);

function cityNights(input: TripInput, days: DayPlan[], city: string, multiCity: boolean): number {
  if (!multiCity) return input.nights;
  return overnightNights(days).find((s) => s.city === city)?.nights ?? 0;
}

/** 상품명·하이라이트에 들어간 대표 일정인지 — 예산 맞추기에서 마지막에만 뺀다 */
export function isSignatureItem(name: string, meta: CourseMeta | null): boolean {
  if (!meta) return false;
  return [meta.packageName, ...meta.highlights].some((text) => text.trim() !== "" && samePlace(name, text));
}

/** 한 번에 모자라는 만큼을 채우는 가장 작은 것, 없으면 큰 것부터 — 바꾸는 개수를 줄인다 */
function chooseGreedy<T extends { savingPerPerson: number }>(options: T[], need: number): T[] {
  const sorted = [...options].sort((a, b) => b.savingPerPerson - a.savingPerPerson);
  const picked: T[] = [];
  let remaining = need;
  const pool = [...sorted];
  while (remaining > 0 && pool.length > 0) {
    const single = [...pool].reverse().find((o) => o.savingPerPerson >= remaining);
    const next = single ?? pool[0];
    picked.push(next);
    remaining -= next.savingPerPerson;
    pool.splice(pool.indexOf(next), 1);
  }
  return picked;
}

/** 예산을 넘었을 때 줄일 방법. 예산 안이면 null */
export function planBudgetFit(
  input: TripInput,
  days: DayPlan[],
  pmChoice: PmChoice,
  plan: BudgetPlan,
  hotelChoices: HotelChoiceLike[],
  meta: CourseMeta | null = null,
): FitPlan | null {
  if (plan.gap === null || plan.gap >= 0) return null;
  const deficit = -plan.gap;
  const reserve = 1 + input.contingencyRate / 100;

  // ① 유료 체험·입장 → 선택 옵션 (대표 일정은 ③으로 미룬다)
  const paid = days.flatMap((d) =>
    dayItems(d, pmChoice)
      .filter((i) => i.type !== "meal" && i.payment !== "local" && i.entryFee > 0)
      .map((i) => ({
        kind: "to-option" as const,
        itemId: i.id,
        dayNo: d.day,
        name: i.name,
        savingPerPerson: i.entryFee * reserve,
        signature: isSignatureItem(i.name, meta),
      })),
  );
  const actions: FitAction[] = chooseGreedy(
    paid.filter((a) => !a.signature),
    deficit,
  );
  let covered = actions.reduce((s, a) => s + a.savingPerPerson, 0);

  // ② 숙소를 한 단계 싼 후보로 (자동 구성으로 찾은 후보가 있을 때)
  if (covered < deficit) {
    const multiCity = hotelChoices.length >= 2;
    const guests = Math.max(1, Math.round(input.guestsPerUnit));
    const hotelSteps: FitAction[] = hotelChoices.flatMap((c) => {
      if (!c.picked) return [];
      const current = c.picked.rate;
      const cheaper = c.candidates.filter((h) => rateOf(h) > 0 && rateOf(h) < current).sort((a, b) => rateOf(b) - rateOf(a));
      const step = cheaper[0];
      if (!step) return [];
      const nights = cityNights(input, days, c.city, multiCity);
      // 숙박비가 줄면 그 비율로 붙는 예비비도 같이 준다 (입장료와 같은 기준)
      const saving = (((current - rateOf(step)) * nights) / guests) * reserve;
      return [{ kind: "hotel" as const, city: c.city, hotel: step, rate: rateOf(step), fromName: c.picked.hotel.name, savingPerPerson: saving }];
    });
    const more = chooseGreedy(hotelSteps, deficit - covered);
    actions.push(...more);
    covered += more.reduce((s, a) => s + a.savingPerPerson, 0);
  }

  // ③ 그래도 모자라면 대표 일정까지
  if (covered < deficit) {
    const more = chooseGreedy(
      paid.filter((a) => a.signature),
      deficit - covered,
    );
    actions.push(...more);
    covered += more.reduce((s, a) => s + a.savingPerPerson, 0);
  }

  return { deficit, actions, gapAfter: covered - deficit, enough: covered >= deficit };
}

/** 예산이 남을 때 올릴 방법 (남은 금액 안의 것만, 최대 3개) */
export function planUpgrades(input: TripInput, days: DayPlan[], plan: BudgetPlan, hotelChoices: HotelChoiceLike[], tours: TourCandidate[], addedTourNames: string[]): Upgrade[] {
  if (plan.gap === null || plan.gap <= 0) return [];
  const room = plan.gap;
  const multiCity = hotelChoices.length >= 2;
  const guests = Math.max(1, Math.round(input.guestsPerUnit));
  const reserve = 1 + input.contingencyRate / 100;
  const out: Upgrade[] = [];
  for (const c of hotelChoices) {
    if (!c.picked) continue;
    const nights = cityNights(input, days, c.city, multiCity);
    const better = c.candidates
      .filter((h) => rateOf(h) > c.picked!.rate)
      .map((h) => ({ h, extra: (((rateOf(h) - c.picked!.rate) * nights) / guests) * reserve }))
      .filter((x) => x.extra <= room)
      .sort((a, b) => b.extra - a.extra)[0];
    if (better) out.push({ kind: "hotel", city: c.city, hotel: better.h, rate: rateOf(better.h), extraPerPerson: better.extra });
  }
  for (const t of tours) {
    if (addedTourNames.includes(t.name)) continue;
    const extra = midpoint(t.priceLow, t.priceHigh) * reserve;
    if (extra > 0 && extra <= room) out.push({ kind: "tour", tour: t, extraPerPerson: extra });
  }
  return out.slice(0, 3);
}

/** 일정 항목을 선택 옵션으로 옮길 때의 옵션 (원가 = 그 항목의 1인 요금, 요금 = 목표 마진 권장가) */
export function itemToOption(item: ItineraryItem, dayNo: number, input: Pick<TripInput, "targetMarginRate" | "cardFeeRate" | "currency">): TourOption {
  return {
    id: `opt-${crypto.randomUUID().slice(0, 8)}`,
    name: item.name,
    description: item.description ?? "",
    durationMinutes: item.stayMinutes,
    dayNo,
    costPerPerson: item.entryFee,
    pricePerPerson: suggestOptionPrice(item.entryFee, input),
    minParticipants: DEFAULT_MIN_PARTICIPANTS,
    participationRate: DEFAULT_PARTICIPATION_RATE,
    note: "예산 맞추기로 기본 일정에서 선택 옵션으로 옮겼습니다",
  };
}

export function describeAction(a: FitAction, money: (v: number) => string): string {
  return a.kind === "to-option"
    ? `DAY ${a.dayNo} '${a.name}'을(를) 선택 옵션으로 (1인 −${money(a.savingPerPerson)})${a.signature ? " — 대표 일정이라 마지막에 골랐습니다" : ""}`
    : `${a.city} 숙소 ${a.fromName} → ${a.hotel.name} (1인 −${money(a.savingPerPerson)})`;
}
