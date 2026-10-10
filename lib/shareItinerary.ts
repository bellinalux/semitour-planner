import { isCoord } from "@/lib/coords";
import { photoOf } from "@/lib/photo";
import { INTENSITY_LABEL, tripIntensity } from "@/lib/intensity";
import { z } from "zod";
import { computeItemTimings, dayMeetingTime, dayTourStart, hotelLeadMinutes } from "@/lib/dayLoad";
import { dayDate, includeLists, tripPeriod } from "@/lib/documents";
import { localPayRows, moneyWithKrw } from "@/lib/fees";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { isMealFiller } from "@/lib/mealTiming";
import { docTitle, englishDayDate, englishMoney, englishPeriod } from "@/lib/englishDoc";
import { DICT, foreignDayDate, foreignDuration, foreignMoney, foreignPeriod, type DocLang } from "@/lib/foreignDoc";
import { conditionTags, mealLabel, restAfter } from "@/lib/itineraryDoc";
import { isPhotoData } from "@/lib/imageResize";
import { packingList } from "@/lib/packingList";
import { dayMeals } from "@/lib/documents";
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
        /** 조·중·석 표기 한 줄 */
        meals: str(160).default(""),
        items: z.array(z.object({ time: str(20), name: str(160), kind: z.enum(["sight", "meal", "move", "hotel", "free", "flight", "other"]), note: str(200), photo: z.string().max(120_000).optional(), photoUrl: z.string().max(500).optional(), photoCredit: z.string().max(160).optional(), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() })).max(40),
      }),
    )
    .max(60),
  included: z.array(str(120)).max(40),
  excluded: z.array(str(120)).max(40),
  notices: z.array(str(300)).max(20),
  company: z.object({ name: str(80), phone: str(40), email: str(120) }),
  updatedAt: str(40),
  /** 준비물 (한 줄씩) */
  packing: z.array(str(200)).max(40).default([]),
  /** 상품 조건 표식 (노쇼핑·노옵션·식사 n회 등) */
  tags: z.array(str(40)).max(10).default([]),
  /** 화면 글자 언어 (외국어 링크면 en·ja·zh) */
  lang: z.enum(["ko", "en", "ja", "zh"]).default("ko"),
  /** 고객이 고를 수 있는 선택관광 (요금을 보일 때만 요금 글) */
  options: z.array(z.object({ name: str(120), price: str(60), day: z.number().int().min(0).max(60) })).max(30).default([]),
  /** 웹에서 [이 일정으로 예약 요청]을 받을지 */
  bookable: z.boolean().default(false),
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
  extraNotices: string[] = [],
  /** 외국어 링크 — 한글 글을 바꿀 번역표 */
  english?: Record<string, string>,
  /** 외국어 링크의 언어 (번역표가 있을 때) */
  foreignLang: DocLang = "en",
): SharedItinerary {
  const { input, days, pmChoice, quote, meta, company } = data;
  const localPay = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, localPay.rows.length > 0);
  const price = quote.partnerConsumerPrice ?? quote.scenario.pricePerPerson;
  const en = !!english && foreignLang === "en";
  // 일본어·중국어 링크 — 고정 글은 외국어 문서 사전을 쓴다
  const fl: DocLang | null = english && foreignLang !== "en" ? foreignLang : null;
  const D = fl ? DICT[fl] : null;
  const tr = (s: string | undefined) => {
    const k = (s ?? "").trim();
    return english ? (english[k] ?? english[k.slice(0, 400)] ?? k) : k;
  };
  const cut = (s: string | undefined, n: number) => tr(s).slice(0, n);
  const nightsDays = en ? `${input.nights}N ${input.days}D` : D ? D.nightsDays(input.nights, input.days) : `${input.nights}박 ${input.days}일`;
  return {
    title: cut(docTitle({ input, meta }), 120),
    destination: cut(input.destination, 100),
    period: `${en ? englishPeriod(input) : fl ? foreignPeriod(fl, input) : tripPeriod(input)} (${nightsDays})`.slice(0, 80),
    travelers: quote.travelers,
    priceLine: !showPrice
      ? ""
      : en
        ? `Per person ${englishMoney(price, input.currency)}${quote.lodgingUnits > 0 ? " (twin sharing)" : ""}`.slice(0, 120)
        : D && fl
          ? `${D.pricePerPerson} ${foreignMoney(fl, price, input.currency)}${quote.lodgingUnits > 0 ? D.twin : ""}`.slice(0, 120)
        : `1인 ${moneyWithKrw(price, input.currency, input.exchangeRateToKrw)}${quote.lodgingUnits > 0 ? " (2인 1실 기준)" : ""}`.slice(0, 120),
    days: days.slice(0, 60).map((d, index) => {
      const items = dayItems(d, pmChoice).filter((i) => !isMealFiller(i));
      const m = dayMeals(days, index, pmChoice, input);
      const flightDay = items.some((i) => i.type === "flight");
      const full = input.packageType === "full";
      const meals = en || fl ? "" : `조 ${mealLabel(m.breakfast, "breakfast", flightDay, full)} · 중 ${mealLabel(m.lunch, "lunch", flightDay, full)} · 석 ${mealLabel(m.dinner, "dinner", flightDay, full)}`;
      const timings = computeItemTimings(items, dayTourStart(d));
      const rest = restAfter(days, index, pmChoice, timings);
      const restEnd = rest ? [...items].reverse().find((i) => i.type !== "hotel") : undefined;
      return {
        day: d.day,
        date: (en ? englishDayDate(input, d.day) : fl ? foreignDayDate(fl, input, d.day) : dayDate(input, d.day)) ?? "",
        theme: cut(d.theme, 120),
        hotel: cut(d.overnightCity ? (input.selectedHotels[d.overnightCity.trim()]?.name ?? d.overnightCity) : "", 120),
        meals: meals.slice(0, 160),
        items: [
          // 호텔 미팅 뒤 첫 장소로 이동하는 날은 미팅을 먼저 (첫 장소 시각 = 미팅 + 이동)
          ...(hotelLeadMinutes(d) > 0
            ? [{ time: d.meetingTime?.trim() ? dayMeetingTime(d) : "", name: en ? "Meet at the hotel lobby and depart" : D ? D.hotelMeeting : "호텔 로비 미팅 후 출발", kind: "move" as const, note: en ? `approx. ${hotelLeadMinutes(d)} min to the first stop` : D && fl ? D.approx(foreignDuration(fl, hotelLeadMinutes(d))) : `첫 장소까지 약 ${hotelLeadMinutes(d)}분` }]
            : []),
          ...items.slice(0, 39).map((it) => {
          const t = timings.get(it.id);
          return {
            time: t ? t.start : "",
            name: cut(it.name, 160),
            kind: KIND[it.type ?? "sightseeing"] ?? "other",
            ...(isPhotoData(it.photo, 120_000) ? { photo: it.photo } : !it.photo && photoOf(it) ? { photoUrl: photoOf(it)!.src.slice(0, 500), photoCredit: photoOf(it)!.credit.slice(0, 160) } : {}),
            ...(isCoord(it.lat, it.lng) ? { lat: it.lat, lng: it.lng } : {}),
            note: (it.payment === "local" ? `${en ? "Paid locally" : D ? D.paidLocally : "현지 지불"}${it.description ? ` · ${tr(it.description.slice(0, 160))}` : ""}` : tr(it.description?.slice(0, 160))).slice(0, 200),
          };
          }),
          ...(rest
            ? [
                {
                  time: (restEnd && timings.get(restEnd.id)?.end) || "",
                  name: en ? (rest.id === "rest-pm" ? "Free afternoon (rest at the hotel or explore on your own)" : "Hotel check-in and free time") : D ? (rest.id === "rest-pm" ? D.restPm : D.checkinRest) : rest.name,
                  kind: "free" as const,
                  note: "",
                },
              ]
            : []),
        ],
      };
    }),
    included: included.slice(0, 40).map((s) => cut(s, 120)),
    excluded: excluded.slice(0, 40).map((s) => cut(s, 120)),
    notices: (D
      ? [...(localPay.rows.length > 0 ? [`${D.paidLocally}: ${localPay.rows.map((r) => tr(r.name)).join(", ")}`] : []), D.changeNote]
      : en
      ? [
          ...(localPay.rows.length > 0 ? [`Paid locally: ${localPay.rows.map((r) => tr(r.name)).join(", ")}`] : []),
          "The order and times may change due to local traffic, weather or opening hours.",
        ]
      : [
          ...(localPay.rows.length > 0 ? [`현지에서 내는 비용: ${localPay.rows.map((r) => r.name).join(", ")}`] : []),
          ...(showPrice ? extraNotices : []),
          "일정은 현지 사정(교통·날씨·운영 시간)에 따라 순서·시각이 바뀔 수 있습니다.",
        ]
    )
      .slice(0, 20)
      .map((s) => s.slice(0, 300)),
    company: { name: cut(company.name, 80), phone: company.phone.trim().slice(0, 40), email: company.email.trim().slice(0, 120) },
    updatedAt: now.toISOString(),
    lang: en ? "en" : fl ?? "ko",
    tags: en || fl ? [] : [...conditionTags(input, days, pmChoice, meta, quote), ...(tripIntensity(days, pmChoice).days.length ? [`활동 강도 ${INTENSITY_LABEL[tripIntensity(days, pmChoice).level]}`] : [])].map((t) => t.slice(0, 40)).slice(0, 10),
    packing: en || fl ? [] : packingList(input, days, pmChoice).flatMap((g) => g.items.map((i) => `${g.title} · ${i}`.slice(0, 200))).slice(0, 40),
    // 선택관광 (요금을 보일 때만 요금) — 고객이 예약 요청에서 고른다
    options: input.options.slice(0, 30).map((o) => ({
      name: cut(o.name, 120),
      price: showPrice && o.pricePerPerson > 0 ? (en ? englishMoney(o.pricePerPerson, input.currency) : fl ? foreignMoney(fl, o.pricePerPerson, input.currency) : moneyWithKrw(o.pricePerPerson, input.currency, input.exchangeRateToKrw)).slice(0, 60) : "",
      day: Math.max(0, Math.min(60, o.dayNo ?? 0)),
    })),
    bookable: true,
  };
}
