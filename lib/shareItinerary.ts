import { z } from "zod";
import { computeItemTimings, dayMeetingTime } from "@/lib/dayLoad";
import { dayDate, includeLists, tripPeriod } from "@/lib/documents";
import { localPayRows, moneyWithKrw } from "@/lib/fees";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { CompanyProfile, CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";

/**
 * 고객용 웹 일정표 — 휴대폰으로 보는 일정·포함 사항·문의 연락처를 링크 하나로 공유한다.
 * 고객에게 나가는 것만 담는다 (원가·마진·업체·경쟁사 없음). 같은 링크에 다시 올리면 내용만 바뀐다.
 */

const str = (max: number) => z.string().max(max);

export const sharedItinerarySchema = z.object({
  title: str(120),
  destination: str(100),
  period: str(80),
  travelers: z.number().int().min(0).max(500),
  /** 1인 요금 한 줄 (가격을 숨기면 빈 문자열) */
  priceLine: str(120),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(60),
        date: str(20),
        theme: str(120),
        hotel: str(120),
        items: z.array(z.object({ time: str(20), name: str(160), kind: z.enum(["sight", "meal", "move", "hotel", "free", "flight", "other"]), note: str(200) })).max(40),
      }),
    )
    .max(60),
  included: z.array(str(120)).max(40),
  excluded: z.array(str(120)).max(40),
  notices: z.array(str(300)).max(20),
  company: z.object({ name: str(80), phone: str(40), email: str(120) }),
  updatedAt: str(40),
});
export type SharedItinerary = z.infer<typeof sharedItinerarySchema>;

export const shareRequestSchema = z.object({
  /** 같은 링크를 고칠 때 (없으면 새 링크) */
  id: z.string().regex(/^[A-Za-z0-9_-]{16,40}$/).optional(),
  itinerary: sharedItinerarySchema,
});

const KIND: Record<string, SharedItinerary["days"][number]["items"][number]["kind"]> = {
  sightseeing: "sight",
  experience: "sight",
  massage: "sight",
  shopping: "sight",
  meal: "meal",
  transfer: "move",
  hotel: "hotel",
  free_time: "free",
  flight: "flight",
};

export function buildSharedItinerary(
  data: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice; quote: QuoteData; meta: CourseMeta | null; company: CompanyProfile },
  showPrice: boolean,
  now = new Date(),
): SharedItinerary {
  const { input, days, pmChoice, quote, meta, company } = data;
  const localPay = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, localPay.rows.length > 0);
  const price = quote.partnerConsumerPrice ?? quote.scenario.pricePerPerson;
  const cut = (s: string | undefined, n: number) => (s ?? "").trim().slice(0, n);
  return {
    title: cut(meta?.packageName, 120) || `${input.destination} ${input.nights}박 ${input.days}일`.slice(0, 120),
    destination: cut(input.destination, 100),
    period: `${tripPeriod(input)} (${input.nights}박 ${input.days}일)`.slice(0, 80),
    travelers: quote.travelers,
    priceLine: showPrice ? `1인 ${moneyWithKrw(price, input.currency, input.exchangeRateToKrw)}${quote.lodgingUnits > 0 ? " (2인 1실 기준)" : ""}`.slice(0, 120) : "",
    days: days.slice(0, 60).map((d) => {
      const items = dayItems(d, pmChoice);
      const timings = computeItemTimings(items, dayMeetingTime(d));
      return {
        day: d.day,
        date: dayDate(input, d.day) ?? "",
        theme: cut(d.theme, 120),
        hotel: cut(d.overnightCity ? (input.selectedHotels[d.overnightCity.trim()]?.name ?? d.overnightCity) : "", 120),
        items: items.slice(0, 40).map((it) => {
          const t = timings.get(it.id);
          return {
            time: t ? t.start : "",
            name: cut(it.name, 160),
            kind: KIND[it.type ?? "sightseeing"] ?? "other",
            note: cut(it.payment === "local" ? `현지 지불${it.description ? ` · ${it.description}` : ""}` : it.description, 200),
          };
        }),
      };
    }),
    included: included.slice(0, 40).map((s) => s.slice(0, 120)),
    excluded: excluded.slice(0, 40).map((s) => s.slice(0, 120)),
    notices: [
      ...(localPay.rows.length > 0 ? [`현지에서 내는 비용: ${localPay.rows.map((r) => r.name).join(", ")}`] : []),
      "일정은 현지 사정(교통·날씨·운영 시간)에 따라 순서·시각이 바뀔 수 있습니다.",
    ].map((s) => s.slice(0, 300)),
    company: { name: cut(company.name, 80), phone: cut(company.phone, 40), email: cut(company.email, 120) },
    updatedAt: now.toISOString(),
  };
}
