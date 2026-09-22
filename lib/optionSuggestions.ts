import { DEFAULT_MIN_PARTICIPANTS, DEFAULT_PARTICIPATION_RATE } from "@/lib/options";
import { mapDayItems } from "@/lib/itinerary";
import type { CurrencyCode, DayPlan, ItineraryItem, OptionSuggestion, TourOption, TripInput } from "@/types";
import type { SuggestedOptionResult } from "@/lib/schemas/optionSuggest";

/** 코스별 옵션 추천 대상이 아닌 유형 (항공·이동·숙소·식사는 현지 액티비티 옵션과 무관하다) */
const NO_SUGGEST_TYPES: ItineraryItem["type"][] = ["flight", "transfer", "hotel", "meal"];

/** 옵션 추천을 요청할 코스들 (모든 날, 오후 A/B 코스 포함). 설명은 AI가 위치·성격을 판단하는 데 쓴다. */
export function optionSuggestTargets(days: DayPlan[]): { id: string; name: string; description?: string; city?: string }[] {
  const out: { id: string; name: string; description?: string; city?: string }[] = [];
  for (const day of days) {
    const city = (day.overnightCity ?? "").trim() || undefined;
    const all = [...day.items, ...day.amGuided, ...day.pmFreeOptions.flatMap((o) => o.items)];
    for (const item of all) {
      if (NO_SUGGEST_TYPES.includes(item.type)) continue;
      out.push({ id: item.id, name: item.name, description: item.description.slice(0, 300) || undefined, city });
    }
  }
  return out;
}

export interface OptionSuggestApplySummary {
  /** 옵션을 하나 이상 찾은 코스 수 */
  coursesWithOptions: number;
  /** 확인된(요금까지 나온) 옵션 총 개수 */
  confirmedOptions: number;
  /** 조사했지만 어울리는 옵션을 찾지 못한 코스 수 */
  noMatch: number;
}

/** 서버 응답을 일정 항목의 suggestedOptions로 반영한다. */
export function applyOptionSuggestions(
  days: DayPlan[],
  results: SuggestedOptionResult[],
  quoteCurrency: CurrencyCode,
): { days: DayPlan[]; summary: OptionSuggestApplySummary } {
  const byId = new Map(results.map((r) => [r.id, r]));
  const summary: OptionSuggestApplySummary = { coursesWithOptions: 0, confirmedOptions: 0, noMatch: 0 };

  const next = days.map((day) =>
    mapDayItems(day, (item) => {
      const result = byId.get(item.id);
      if (!result) return item;

      const suggestedOptions: OptionSuggestion[] = result.options.map((o) => {
        if (o.status === "confirmed") summary.confirmedOptions++;
        const local = o.localCurrency && o.localAmount > 0 && o.localCurrency !== quoteCurrency ? { currency: o.localCurrency as CurrencyCode, amount: o.localAmount } : undefined;
        return {
          name: o.name,
          description: o.description,
          status: o.status,
          amount: o.amountInQuote ?? 0,
          local,
          sourceName: o.sourceName,
          note: o.note,
        };
      });

      if (suggestedOptions.length > 0) summary.coursesWithOptions++;
      else summary.noMatch++;
      return { ...item, suggestedOptions };
    }),
  );

  return { days: next, summary };
}

/** 추천 옵션을 "선택 옵션"으로 바꾼다. 웹에서 찾은 현지 판매가를 요금으로 두고, 원가는 목표 마진을 뺀 가정값이다. */
export function suggestionToOption(
  suggestion: OptionSuggestion,
  dayNo: number,
  input: Pick<TripInput, "targetMarginRate" | "cardFeeRate">,
): TourOption {
  const keepRate = Math.max(0, 1 - input.targetMarginRate / 100 - input.cardFeeRate / 100);
  const price = suggestion.amount;
  const cost = Math.floor(price * keepRate);
  return {
    id: `opt-${crypto.randomUUID().slice(0, 8)}`,
    name: suggestion.name,
    description: suggestion.description,
    durationMinutes: 0,
    dayNo,
    costPerPerson: cost,
    pricePerPerson: price,
    minParticipants: DEFAULT_MIN_PARTICIPANTS,
    participationRate: DEFAULT_PARTICIPATION_RATE,
    note: [
      "웹에서 확인한 현지 판매가를 옵션 요금으로 넣었습니다. 원가는 목표 마진을 뺀 가정값이니 실제 매입가로 고치세요.",
      suggestion.sourceName ? `확인 출처: ${suggestion.sourceName}` : "",
      suggestion.note,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
