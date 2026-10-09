"use client";

import { Loader2, UtensilsCrossed } from "lucide-react";
import { useRequest } from "@/hooks/useRequest";
import { formatMoney } from "@/lib/currency";
import type { OffRouteMeal } from "@/lib/routeOrder";
import type { RestaurantCandidate, RestaurantRequest, RestaurantResponse } from "@/lib/schemas/restaurant";
import type { CurrencyCode, ItineraryItem, TripScope } from "@/types";

interface Props {
  meal: OffRouteMeal;
  destination: string;
  travelers?: number;
  tripScope: TripScope;
  currency: CurrencyCode;
  /** 고른 식당으로 그 식사 항목을 바꾼다 */
  onReplace: (itemId: string, patch: Partial<ItineraryItem>) => void;
}

/**
 * 동선상 식당 — 식사 무렵 일행이 있는 지역과 식당 지역이 달라 되돌아오는 이동이 생기면 알리고,
 * 그 지역 안에서 단체가 갈 만한 식당을 웹에서 찾아 바꿀 수 있게 한다. 업체가 정한 식당이면 바꾸지 말고 순서를 맞춘다.
 */
export function MealRoutePanel({ meal, destination, travelers, tripScope, currency, onReplace }: Props) {
  const { state, data, run } = useRequest<RestaurantRequest, RestaurantResponse>("/api/suggest-restaurant");
  const money = (v: number) => formatMoney(v, currency);
  const search = () =>
    void run({
      destination: destination.trim() || meal.hereRegion,
      region: meal.hereRegion,
      nearPlaces: meal.nearPlaces,
      meal: meal.meal,
      cuisine: meal.cuisine,
      current: meal.mealName,
      travelers: Math.min(60, Math.max(1, travelers ?? 10)),
      tripScope,
      currency,
    });
  const choose = (r: RestaurantCandidate) =>
    onReplace(meal.mealId, {
      name: `${meal.meal === "lunch" ? "점심" : "저녁"} 식사 (${r.name})`,
      description: [r.area, r.reason, r.groupOk ? "단체 가능" : "단체 수용 확인 필요"].filter(Boolean).join(" · "),
      cuisine: r.cuisine || undefined,
      ...(r.mealCost > 0 ? { mealCost: r.mealCost } : {}),
      isEstimated: true,
      timeCheck: { basis: "area", area: r.area || meal.hereRegion, region: meal.hereRegion, sourceName: r.sourceName || undefined, checkedAt: new Date().toISOString() },
    });

  return (
    <div className="border-b border-slate-100 bg-amber-50 px-4 py-2 text-[11px] leading-4 text-amber-900">
      <p className="flex flex-wrap items-start gap-1.5">
        <UtensilsCrossed className="mt-px size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 text-pretty">
          {meal.mealName}이(가) {meal.mealRegion}에 있어, {meal.hereRegion} 일정 사이에 다녀오느라 되돌아오는 이동이 생깁니다. {meal.hereRegion} 안 식당으로 바꾸면 동선이 한 방향이 됩니다.
          <span className="block text-amber-700">업체가 정한 식당이면 바꾸지 말고 코스 엔진 점검으로 순서를 맞추세요.</span>
        </span>
        <button
          type="button"
          onClick={search}
          disabled={state.status === "loading"}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold hover:bg-amber-100 disabled:opacity-60"
        >
          {state.status === "loading" && <Loader2 className="size-3 animate-spin" aria-hidden />}
          {state.status === "loading" ? "찾는 중… (30초 안팎)" : `${meal.hereRegion} 식당 찾기`}
        </button>
      </p>
      {state.status === "error" && (
        <p role="alert" className="mt-1 text-red-700">
          {state.error}
        </p>
      )}
      {state.status === "success" && data && (
        <ul className="mt-2 space-y-1.5">
          {data.restaurants.length === 0 && <li className="text-slate-600">근거 있는 식당을 찾지 못했습니다. 업체에 동선상 식당을 문의하세요.</li>}
          {!data.searched && <li className="text-slate-600">웹 검색 근거가 없어 추천하지 않았습니다.</li>}
          {data.restaurants.map((r) => (
            <li key={r.name} className="flex flex-wrap items-start gap-2 rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-slate-700">
              <span className="min-w-0 flex-1 text-pretty">
                <b className="text-slate-900">{r.name}</b>
                {r.cuisine && <span className="text-slate-500"> · {r.cuisine}</span>}
                <span className="block text-slate-500">
                  {[r.area, r.walkMinutes > 0 ? `걸어서 ${r.walkMinutes}분` : "", r.mealCost > 0 ? `1인 ${money(r.mealCost)}` : "", r.groupOk ? "단체 가능" : "단체 수용 확인 필요", r.sourceName]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <button type="button" onClick={() => choose(r)} className="shrink-0 rounded border border-indigo-300 bg-indigo-600 px-2 py-0.5 font-semibold text-white hover:bg-indigo-700">
                이 식당으로 바꾸기
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
