import { dayItems, pickPmOption, type PmChoice } from "@/lib/itinerary";
import type { UspRequest } from "@/lib/schemas/usp";
import type { CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";

/** 관광 성격이 없는 항목(항공/이동/숙소)은 장점 근거로 쓰지 않는다 */
const SKIPPED_TYPES = new Set(["flight", "transfer", "hotel"]);

/** 화면 상태(입력, 일정, 견적)를 /api/generate-usp 요청 본문으로 변환한다. */
export function buildUspRequest(
  input: TripInput,
  days: DayPlan[],
  pmChoice: PmChoice,
  quote: QuoteData,
  meta: CourseMeta | null,
): UspRequest {
  return {
    destination: input.destination.trim(),
    days: input.days,
    travelers: quote.travelers,
    currency: input.currency,
    pricePerPerson: quote.scenario.pricePerPerson,
    ourIncludes: quote.ourIncludes,
    itinerary: days.map((day) => {
      if (day.kind === "linear") {
        return {
          day: day.day,
          theme: day.theme,
          amPlaces: dayItems(day, pmChoice)
            .filter((i) => !SKIPPED_TYPES.has(i.type ?? "sightseeing"))
            .map((i) => i.name),
          pmTitle: "",
          pmPlaces: [],
        };
      }
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
    features: {
      nights: input.nights,
      cities: meta?.cities ?? [],
      hotelGrade: meta?.hotelGrade ?? "",
      noShopping: meta?.noShopping ?? false,
      noOption: meta?.noOption ?? false,
      highlights: meta?.highlights ?? [],
    },
  };
}
