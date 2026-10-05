/**
 * 세미투어 일정 → 스튜디오 상품 데이터(studio-product v1). 상세페이지 스튜디오로 보내기·파일 받기에 쓴다.
 *  - 그날 실제로 진행하는 항목(오전 전체 + 고른 오후 코스)만 코스로 넣고, 항공·호텔 조식은 뺀다
 *  - 시각은 일정표와 같은 계산(미팅 시각 + 체류 + 이동)
 *  - 원가·판매가 같은 내부 정보는 넣지 않는다(고객용 상세페이지 재료만)
 */
import { clockMinutes, computeItemTimings, dayMeetingTime } from "@/lib/dayLoad";
import { TRAVEL_TYPES } from "@/lib/defaults";
import { isBreakfastItem } from "@/lib/documents";
import { isLocalPay } from "@/lib/fees";
import { formatDuration } from "@/lib/format";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { StudioProduct } from "@/lib/studioProduct";
import type { CourseMeta, DayPlan, ItineraryItem, TripInput } from "@/types";

const NOT_COURSE = new Set(["flight", "hotel"]);
const feeWord = (i: ItineraryItem) => (i.type === "meal" ? "식대" : i.type === "experience" || i.type === "massage" ? "체험료" : "입장료");

export function planToProduct(o: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice; meta?: CourseMeta | null }): StudioProduct & { source: string } {
  const { input, days, pmChoice, meta } = o;
  const parts = input.destination.split(",").map((s) => s.trim()).filter(Boolean);
  const region = parts[0] ?? "";
  const country = parts.length > 1 ? parts[parts.length - 1] : "";
  const typeLabel = TRAVEL_TYPES.find((t) => t.id === input.travelType)?.label ?? "";
  const tourDays = days.filter((d) => dayItems(d, pmChoice).some((i) => !NOT_COURSE.has(i.type ?? "sightseeing")));
  const n = tourDays.length;

  const excluded = new Set<string>();
  const outDays = tourDays.map((d) => {
    const all = dayItems(d, pmChoice);
    const timing = computeItemTimings(all, dayMeetingTime(d));
    const amIds = new Set(d.kind === "semi" ? d.amGuided.map((i) => i.id) : []);
    const courses = all
      .filter((i) => !NOT_COURSE.has(i.type ?? "sightseeing") && !isBreakfastItem(i))
      .map((i) => {
        if (isLocalPay(i) && (i.entryFee > 0 || i.mealCost > 0)) excluded.add(`${i.name} ${feeWord(i)}(현지 지불)`);
        const pm = d.kind === "semi" && !amIds.has(i.id);
        return {
          name: i.name,
          time: timing.get(i.id)?.start ?? "",
          stay: i.stayMinutes > 0 ? formatDuration(i.stayMinutes) : "",
          // 세미투어 오후는 고객이 자유롭게 다니는 추천 코스 — 상세페이지에서도 알 수 있게 표시한다
          desc: `${pm ? "[오후 자유 추천] " : ""}${i.description}`.trim(),
        };
      });
    return { title: d.theme, courses };
  }).filter((d) => d.courses.length);

  const first = tourDays[0];
  // 당일 상품의 소요 시간: 미팅부터 마지막 코스가 끝날 때까지
  const hours = (() => {
    if (n !== 1 || !first) return "";
    const items = dayItems(first, pmChoice);
    const t = computeItemTimings(items, dayMeetingTime(first));
    const ends = items.map((i) => t.get(i.id)?.end).filter((x): x is string => !!x);
    const end = clockMinutes(ends[ends.length - 1] ?? "");
    const start = clockMinutes(dayMeetingTime(first));
    return end !== null && start !== null && end > start ? `약 ${Math.round((end - start) / 60)}시간` : "";
  })();

  const nights = Math.max(0, n - 1);
  const title = meta?.packageName?.trim() || [region, n > 1 ? `${nights}박 ${n}일` : "당일", typeLabel].filter(Boolean).join(" ");
  return {
    schema: "studio-product",
    version: 1,
    source: "semitour",
    title,
    subtitle: n === 1 ? first?.theme ?? "" : "",
    intro: meta?.highlights?.length ? meta.highlights.join(" · ") : "",
    country,
    region,
    duration: n > 1 ? `${nights}박 ${n}일` : hours,
    minPax: input.minTravelers > 0 ? `${input.minTravelers}명` : "",
    tourType: typeLabel,
    meeting: first ? { time: dayMeetingTime(first) } : {},
    excluded: [...excluded],
    days: outDays,
  };
}
