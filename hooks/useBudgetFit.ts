"use client";

import { useState } from "react";
import { budgetPlan } from "@/lib/budget";
import { describeAction, itemToOption, planBudgetFit, planUpgrades, type FitPlan, type HotelChoiceLike, type Upgrade } from "@/lib/budgetFit";
import { formatMoney } from "@/lib/currency";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, QuoteResult, TourCandidate, TripInput } from "@/types";

interface Options {
  input: TripInput;
  update: (patch: Partial<TripInput>) => void;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteResult | null;
  replaceDays: (days: DayPlan[]) => void;
  hotelChoices: HotelChoiceLike[];
  tours: TourCandidate[];
  insertTour: (tour: TourCandidate) => void;
  onHotelChosen: (city: string, hotel: HotelChoiceLike["candidates"][number]) => void;
}

interface Snapshot {
  days: DayPlan[];
  input: Pick<TripInput, "options" | "selectedHotels" | "lodgingRatePerNight" | "lodgingCityRates" | "costStatus" | "costSource">;
}

export interface BudgetFitView {
  plan: FitPlan | null;
  upgrades: Upgrade[];
  /** 예산 맞추기로 바꾼 내용 (되돌리기 전까지) */
  applied: string[];
  apply: () => void;
  undo: () => void;
  upgrade: (u: Upgrade) => void;
  money: (v: number) => string;
}

/** 견적 화면의 "예산 맞추기" — 넘으면 자동으로 줄이고(되돌리기 가능), 남으면 올릴 방법을 보여 준다 */
export function useBudgetFit({ input, update, days, pmChoice, quote, replaceDays, hotelChoices, tours, insertTour, onHotelChosen }: Options): BudgetFitView | null {
  const [applied, setApplied] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [addedTours, setAddedTours] = useState<string[]>([]);
  const money = (v: number) => formatMoney(Math.round(v), input.currency);

  const plan = quote?.ok ? budgetPlan(input, quote, quote.groundDays) : null;
  if (!plan || !quote?.ok) return null;
  const fit = planBudgetFit(input, days, pmChoice, plan, hotelChoices);
  const upgrades = planUpgrades(input, days, plan, hotelChoices, tours, addedTours);

  const apply = () => {
    if (!fit || fit.actions.length === 0) return;
    setSnapshot({
      days,
      input: {
        options: input.options,
        selectedHotels: input.selectedHotels,
        lodgingRatePerNight: input.lodgingRatePerNight,
        lodgingCityRates: input.lodgingCityRates,
        costStatus: input.costStatus,
        costSource: input.costSource,
      },
    });
    // 선택 옵션으로 옮길 항목: 일정에서 빼고 옵션에 더한다
    const moving = fit.actions.filter((a) => a.kind === "to-option");
    const movingIds = new Set(moving.map((a) => a.itemId));
    const newOptions = moving.flatMap((a) => {
      const day = days.find((d) => d.day === a.dayNo);
      const item = day ? dayItems(day, pmChoice).find((i) => i.id === a.itemId) : undefined;
      return item ? [itemToOption(item, a.dayNo, input)] : [];
    });
    if (movingIds.size > 0) {
      replaceDays(
        days.map((d) => ({
          ...d,
          items: d.items.filter((i) => !movingIds.has(i.id)),
          amGuided: d.amGuided.filter((i) => !movingIds.has(i.id)),
          pmFreeOptions: d.pmFreeOptions.map((o) => ({ ...o, items: o.items.filter((i) => !movingIds.has(i.id)) })),
        })),
      );
    }
    if (newOptions.length > 0) update({ options: [...input.options, ...newOptions] });
    // 숙소 바꾸기는 자동 구성의 후보 선택과 같은 길로 (견적 반영 + 후보 목록 표시)
    for (const a of fit.actions) if (a.kind === "hotel") onHotelChosen(a.city, a.hotel);
    setApplied(fit.actions.map((a) => describeAction(a, money)));
  };

  const undo = () => {
    if (!snapshot) return;
    replaceDays(snapshot.days);
    update(snapshot.input);
    setSnapshot(null);
    setApplied([]);
  };

  const upgrade = (u: Upgrade) => {
    if (u.kind === "tour") {
      insertTour(u.tour);
      setAddedTours((prev) => [...prev, u.tour.name]);
    } else onHotelChosen(u.city, u.hotel);
  };

  return { plan: fit, upgrades, applied, apply, undo, upgrade, money };
}
