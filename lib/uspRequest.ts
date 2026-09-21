import { pickPmOption, type PmChoice } from "@/lib/itinerary";
import type { UspRequest } from "@/lib/schemas/usp";
import type { DayPlan, QuoteData, TripInput } from "@/types";

/** 화면 상태(입력, 일정, 견적)를 /api/generate-usp 요청 본문으로 변환한다. */
export function buildUspRequest(
  input: TripInput,
  days: DayPlan[],
  pmChoice: PmChoice,
  quote: QuoteData,
): UspRequest {
  return {
    destination: input.destination.trim(),
    days: input.days,
    travelers: quote.travelers,
    currency: input.currency,
    pricePerPerson: quote.scenario.pricePerPerson,
    ourIncludes: quote.ourIncludes,
    itinerary: days.map((day) => {
      const pm = pickPmOption(day, pmChoice);
      return {
        day: day.day,
        theme: day.theme,
        amPlaces: day.amGuided.map((i) => i.name),
        pmTitle: pm?.title ?? "",
        pmPlaces: pm?.items.map((i) => i.name) ?? [],
      };
    }),
    competitors: input.competitors.map((c) => ({
      name: c.name,
      price: c.price,
      includes: c.includes,
      note: c.note,
    })),
  };
}
