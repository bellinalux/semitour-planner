/**
 * 세미투어 일정(DayPlan) ↔ 코스 엔진 요청/결과 변환 (화면과 무관한 순수 함수).
 *  - 업체 코스(linear) 날: 엔진 추천 순서로 바꾸기까지
 *  - 세미투어(semi) 날: 오전 가이드 일정만 순서를 바꾸고, 오후 반자유 코스는 시간·주의만 채운다
 */
import { dayMeetingTime } from "@/lib/dayLoad";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { hoursText } from "@/lib/courseEngine";
import type { PlaceKnowledge, PlanResponse } from "@/lib/server/courseEngineServer";
import type { DayPlan, ItineraryItem, TravelType } from "@/types";

export interface EngineDayRequest {
  places: { id: string; name: string; stayMin: number; kind?: "sight" | "meal" | "free" | "transfer" | "end"; priority?: 1 | 2 | 3; fixedOrder?: "first" | "last" }[];
  city: string; country: string; date?: string; start: string; maxEnd: string;
  mode: "car" | "walk" | "public"; audience: "any" | "couple" | "family" | "senior" | "group"; reorder: boolean; lookup: boolean;
}

const KIND: Record<string, EngineDayRequest["places"][number]["kind"]> = { meal: "meal", free_time: "free", transfer: "transfer", hotel: "end", massage: "sight", shopping: "sight", experience: "sight", sightseeing: "sight" };
/** 유형이 없는 항목(예전에 만든 AI 세미투어)은 식대·음식 종류·이름으로 식사를 알아본다 (문서의 조중석 표기와 같은 기준) */
const MEAL_NAME = /점심|저녁|식사|중식|석식|런치|디너|lunch|dinner/i;
function kindOf(i: ItineraryItem): EngineDayRequest["places"][number]["kind"] {
  if (i.type) return KIND[i.type] ?? "sight";
  return i.cuisine || i.mealCost > 0 || MEAL_NAME.test(i.name) ? "meal" : "sight";
}
const AUD:Partial<Record<TravelType, EngineDayRequest["audience"]>> = { senior: "senior", honeymoon: "couple", package: "group", accessible: "senior" };

/** 엔진에 보낼 그날의 항목 (항공은 뺀다) */
export function engineItems(day: DayPlan, pmChoice: PmChoice): ItineraryItem[] {
  return dayItems(day, pmChoice).filter(i => (i.type ?? "sightseeing") !== "flight");
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildDayRequest(day: DayPlan, pmChoice: PmChoice, o: { destination: string; departureDate?: string; travelType: TravelType }): EngineDayRequest | null {
  const items = engineItems(day, pmChoice);
  if (items.length < 2) return null;
  const parts = o.destination.split(",").map(s => s.trim()).filter(Boolean);
  const country = parts.length > 1 ? parts[parts.length - 1] : "";
  const city = day.overnightCity || parts[0] || o.destination;
  return {
    places: items.map(i => {
      const kind = kindOf(i);
      return { id: i.id, name: i.name, stayMin: Math.max(0, Math.min(720, i.stayMinutes || 0)), kind, priority: kind === "sight" ? 2 : 1, ...(kind === "end" ? { fixedOrder: "last" as const } : {}) };
    }),
    city, country,
    ...(o.departureDate && /^\d{4}-\d{2}-\d{2}$/.test(o.departureDate) ? { date: addDays(o.departureDate, day.day - 1) } : {}),
    start: dayMeetingTime(day), maxEnd: "19:00",
    mode: "car", audience: AUD[o.travelType] ?? "any",
    reorder: day.kind === "linear", lookup: true,
  };
}

/** 장소 지식 → 주의사항 한 줄 (영업시간·마지막 입장·예약·팁) */
export function cautionFrom(k?: PlaceKnowledge): string {
  if (!k) return "";
  return [hoursText(k.open) && `영업 ${hoursText(k.open)}`, k.lastEntry && `마지막 입장 ${k.lastEntry}`, k.reservation, ...(k.tips ?? []).slice(0, 2)].filter(Boolean).join(" · ");
}

/**
 * 결과를 그날 일정에 넣는다.
 *  useBest: 엔진 추천 순서·시간 / 아니면 지금 순서에 이동 시간·주의만
 *  drop: 뺄 항목 id
 */
export function applyDayResult(days: DayPlan[], dayNo: number, res: PlanResponse, o: { useBest: boolean; drop?: string[]; meetingTime?: string }): DayPlan[] {
  return days.map(d => {
    if (d.day !== dayNo) return d;
    const plan = o.useBest ? res.best : res.current;
    const tl = plan.timeline;
    const nextTravel = new Map<string, number>();
    tl.forEach((s, i) => { const nx = tl[i + 1]; if (nx) nextTravel.set(s.id, nx.travelFromPrev); });
    const know = new Map(res.places.map(p => [p.id, p.knowledge]));
    const stay = new Map(res.places.map(p => [p.id, p.stayMin]));
    const drop = new Set(o.drop ?? []);
    const patch = (it: ItineraryItem): ItineraryItem | null => {
      if (drop.has(it.id)) return null;
      if (!stay.has(it.id)) return it;
      const c = cautionFrom(know.get(it.id));
      return {
        ...it,
        stayMinutes: it.stayMinutes || stay.get(it.id) || it.stayMinutes,
        travelMinutesToNext: nextTravel.has(it.id) ? nextTravel.get(it.id)! : it.travelMinutesToNext,
        ...(c && !(it.caution ?? "").includes(c.slice(0, 12)) ? { caution: [it.caution, c].filter(Boolean).join(" / ") } : {}),
      };
    };
    const order = o.useBest ? plan.order : null;
    const reorder = (list: ItineraryItem[]) => {
      if (!order) return list;
      const rank = new Map(order.map((id, i) => [id, i]));
      return list.slice().sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    };
    const fix = (list: ItineraryItem[], canReorder: boolean) => (canReorder ? reorder(list) : list).flatMap(it => patch(it) ?? []);
    return {
      ...d,
      ...(o.meetingTime ? { meetingTime: o.meetingTime } : {}),
      items: fix(d.items, d.kind === "linear"),
      amGuided: fix(d.amGuided, false),
      pmFreeOptions: d.pmFreeOptions.map(p => ({ ...p, items: fix(p.items, false) })),
    };
  });
}
