/**
 * 세미투어 일정(DayPlan) ↔ 코스 엔진 요청/결과 변환 (화면과 무관한 순수 함수).
 *  - 업체 코스(linear) 날: 엔진 추천 순서로 바꾸기까지
 *  - 세미투어(semi) 날: 오전 가이드 일정만 순서를 바꾸고, 오후 반자유 코스는 시간·주의만 채운다
 */
import { dayMeetingTime, walkTimeline } from "@/lib/dayLoad";
import { fmt } from "@/lib/courseEngine";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { hoursText } from "@/lib/courseEngine";
import type { PlaceKnowledge, PlanResponse } from "@/lib/server/courseEngineServer";
import type { DayPlan, ItineraryItem, TravelType } from "@/types";
import { roundMinutes } from "@/lib/format";
import { refitMealWindows } from "@/lib/mealTiming";

export interface EngineDayRequest {
  places: { id: string; name: string; stayMin: number; kind?: "sight" | "meal" | "free" | "transfer" | "end"; priority?: 1 | 2 | 3; fixedOrder?: "first" | "last"; meal?: "lunch" | "dinner" | "cafe"; area?: string; region?: string; best?: "night" }[];
  city: string; country: string; date?: string; start: string; maxEnd: string;
  mode: "car" | "walk" | "public"; audience: "any" | "couple" | "family" | "senior" | "group"; reorder: boolean; lookup: boolean;
  /** 앱 일정표의 이동 시간 (이어지는 두 항목마다) — 엔진이 일정표와 같은 시계로 채점하게 */
  legs?: { from: string; to: string; minutes: number }[];
  /** 항공 등으로 시작 시각이 정해진 날 */
  fixedStart?: boolean;
  homeRegion?: string;
}

const KIND: Record<string, EngineDayRequest["places"][number]["kind"]> = { meal: "meal", free_time: "free", transfer: "transfer", hotel: "end", massage: "sight", shopping: "sight", experience: "sight", sightseeing: "sight" };
/** 유형이 없는 항목(예전에 만든 AI 세미투어)은 식대·음식 종류·이름으로 식사를 알아본다 (문서의 조중석 표기와 같은 기준) */
const MEAL_NAME = /점심|저녁|식사|중식|석식|런치|디너|lunch|dinner/i;
/**
 * 공항·출입국·가이드 미팅·호텔 체크인/아웃처럼 시간이 정해진 이동 일정 — AI가 관광(sightseeing)으로 잘못 분류해도
 * 이름으로 알아보고, 엔진에는 이동(transfer)으로 보내며 순서를 바꾸지 않는다.
 */
const FIXED_MOVE = /공항|airport|출국|입국|미팅|meeting|체크인|체크아웃|check-?in|check-?out|(출발|도착)\s*(\(|$|[0-9])/i;
export const isFixedMove = (i: ItineraryItem) => i.type === "flight" || i.type === "transfer" || i.type === "hotel" || FIXED_MOVE.test(i.name);

function kindOf(i: ItineraryItem): EngineDayRequest["places"][number]["kind"] {
  if (i.type !== "hotel" && FIXED_MOVE.test(i.name)) return "transfer";
  if (i.type) return KIND[i.type] ?? "sight";
  return i.cuisine || i.mealCost > 0 || MEAL_NAME.test(i.name) ? "meal" : "sight";
}
/** 식사 종류 — 점심·저녁은 시간대를 지키고 카페·간식은 시간대가 없다. "식사"만 적혀 있으면 일정표 시각(15시 전후)으로 정한다 */
function mealKind(i: ItineraryItem, start: number | undefined): "lunch" | "dinner" | "cafe" {
  const text = `${i.name} ${i.description ?? ""}`;
  if (/점심|중식|런치|lunch/i.test(text)) return "lunch";
  if (/저녁|석식|디너|dinner/i.test(text)) return "dinner";
  if (/식사|정식|뷔페|buffet|meal/i.test(text)) return start != null && start % 1440 >= 15 * 60 ? "dinner" : "lunch";
  return "cafe";
}

/** 저녁에 하는 일정 (이런 일정이 있으면 하루 끝을 늦게 본다) */
const EVENING = /야경|야시장|야간|분수쇼|나이트|night|저녁|석식|디너|dinner/i;
const NIGHT = /야경|야시장|야간|분수쇼|나이트|night/i;
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
  // 앱 일정표 시각 — 엔진은 항공을 빼고 받으므로, 항공 뒤 첫 항목의 일정표 시각에서 시작해야 한다(예: 12:50 도착 뒤 13:40)
  const all = dayItems(day, pmChoice);
  const startOf = new Map(walkTimeline(all, dayMeetingTime(day)).map((s) => [s.item.id, s.start]));
  const firstStart = startOf.get(items[0].id);
  const hasFlight = all.some((i) => (i.type ?? "") === "flight");
  // 숙소 쪽 지역: 숙소 항목, 없으면 하루 마지막의 야경·저녁 일정이 있는 지역 (시간 검증으로 붙은 큰 지역)
  const regionOfItem = (i: ItineraryItem) => (i.timeCheck?.basis === "area" ? i.timeCheck.region || i.timeCheck.area : undefined);
  const homeRegion =
    regionOfItem(all.find((i) => i.type === "hotel") ?? ({} as ItineraryItem)) ??
    [...all].reverse().filter((i) => EVENING.test(`${i.name} ${i.description}`)).map(regionOfItem).find(Boolean);
  // 이어지는 두 항목의 일정표 이동 시간 (사이에 항공이 끼면 넣지 않는다)
  const legs = items.slice(1).flatMap((it, k) => {
    const prev = items[k];
    return all.indexOf(it) === all.indexOf(prev) + 1 ? [{ from: prev.id, to: it.id, minutes: Math.max(0, prev.travelMinutesToNext ?? 0) }] : [];
  });
  return {
    places: items.map(i => {
      const kind = kindOf(i);
      const start = startOf.get(i.id);
      return {
        id: i.id, name: i.name, stayMin: Math.max(0, Math.min(720, i.stayMinutes || 0)), kind, priority: kind === "sight" ? 2 : 1,
        ...(kind === "end" ? { fixedOrder: "last" as const } : {}),
        // 하루를 여는 가이드 미팅·공항 이동은 맨 앞에서 움직이지 않는다
        ...(kind === "transfer" && items.slice(0, items.indexOf(i)).every((x) => kindOf(x) === "transfer") ? { fixedOrder: "first" as const } : {}),
        ...(kind === "meal" ? { meal: mealKind(i, start) } : {}),
        ...(i.timeCheck?.basis === "area" && i.timeCheck.area ? { area: i.timeCheck.area } : {}),
        ...(i.timeCheck?.basis === "area" && i.timeCheck.region ? { region: i.timeCheck.region } : {}),
        // 야경·분수쇼 같은 밤 일정 — 숙소 쪽으로 돌아가며 하는 일정이라 지나온 구역이어도 지그재그로 보지 않는다
        ...(kind === "sight" && NIGHT.test(`${i.name} ${i.description}`) ? { best: "night" as const } : {}),
      };
    }),
    legs,
    ...(hasFlight ? { fixedStart: true } : {}),
    ...(homeRegion ? { homeRegion } : {}),
    city, country,
    ...(o.departureDate && /^\d{4}-\d{2}-\d{2}$/.test(o.departureDate) ? { date: addDays(o.departureDate, day.day - 1) } : {}),
    // 야경·분수쇼·저녁 식사 같은 저녁 일정이 있는 날은 19시에 끊으면 엔진이 그 일정을 빼 버린다
    start: firstStart != null ? fmt(firstStart % 1440) : dayMeetingTime(day), maxEnd: items.some((i) => EVENING.test(`${i.name} ${i.description}`)) ? "23:00" : "19:00",
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
/** 순서를 바꾸지 않는 항목 — 항공·이동·숙소·자유시간, 저녁 식사·야경 같은 저녁 일정은 제자리에 둔다 */
const ANCHOR_TYPES = new Set(["flight", "transfer", "hotel", "free_time"]);
// 점심·카페는 엔진이 점심 시간대를 지키며 정한 자리를 따른다 — 제자리에 두면 다른 지역 식당을 사이에 두고 구역이 쪼개진다(지그재그).
export const isCafeMeal = (it: ItineraryItem) => kindOf(it) === "meal" && mealKind(it, undefined) === "cafe";
const isAnchor = (it: ItineraryItem) => ANCHOR_TYPES.has(it.type ?? "sightseeing") || isFixedMove(it) || EVENING.test(it.name);

/**
 * 엔진 추천 순서를 하루 목록에 넣는다 — 엔진이 순서를 정한 관광지들만 자기들 자리 안에서 추천 순서대로 바꾸고,
 * 나머지(항공·식사·숙소·자유시간·저녁 일정)와 엔진이 시간 안에 못 넣어 뺀 관광지는 원래 자리에 그대로 둔다(빼기는 따로 버튼으로).
 */
export function reorderByEngine(list: ItineraryItem[], order: string[]): ItineraryItem[] {
  const inOrder = new Set(order);
  const slots = list.map((it, i) => (!isAnchor(it) && inOrder.has(it.id) ? i : -1)).filter((i) => i >= 0);
  const byId = new Map(slots.map((i) => [list[i].id, list[i]]));
  const sequence = order.map((id) => byId.get(id)).filter((s): s is ItineraryItem => s !== undefined);
  const next = list.slice();
  slots.forEach((slot, k) => (next[slot] = sequence[k]));
  return next;
}

export function applyDayResult(days: DayPlan[], dayNo: number, res: PlanResponse, o: { useBest: boolean; drop?: string[]; meetingTime?: string }): DayPlan[] {
  return days.map(d => {
    if (d.day !== dayNo) return d;
    const plan = o.useBest ? res.best : res.current;
    const tl = plan.timeline;
    // 엔진이 계산한 "이 장소 → 바로 다음 장소" 이동 시간. 순서를 바꾼 뒤에도 실제로 이어지는 짝에만 쓴다
    const pairTravel = new Map<string, number>();
    tl.forEach((s, i) => { const nx = tl[i + 1]; if (nx) pairTravel.set(`${s.id}>${nx.id}`, nx.travelFromPrev); });
    const know = new Map(res.places.map(p => [p.id, p.knowledge]));
    const stay = new Map(res.places.map(p => [p.id, p.stayMin]));
    const drop = new Set(o.drop ?? []);
    const patch = (it: ItineraryItem, nextId: string | undefined, moved: boolean): ItineraryItem | null => {
      if (drop.has(it.id)) return null;
      if (!stay.has(it.id)) return it;
      const c = cautionFrom(know.get(it.id));
      const engineTravel = nextId ? pairTravel.get(`${it.id}>${nextId}`) : undefined;
      return {
        ...it,
        stayMinutes: it.stayMinutes || stay.get(it.id) || it.stayMinutes,
        // 하루 일정 시간 검증(구역 단위)으로 맞춘 이동은, 순서가 그대로인 항목이면 유지한다 — 엔진은 좌표를 모르는 식사·카페 앞뒤를 일괄 15분으로 본다
        travelMinutesToNext:
          !moved && it.timeCheck?.basis === "area"
            ? it.travelMinutesToNext
            : engineTravel !== undefined
              ? roundMinutes(engineTravel)
              : it.travelMinutesToNext,
        ...(c && !(it.caution ?? "").includes(c.slice(0, 12)) ? { caution: [it.caution, c].filter(Boolean).join(" / ") } : {}),
      };
    };
    const fix = (list: ItineraryItem[], canReorder: boolean) => {
      const ordered = canReorder && o.useBest ? reorderByEngine(list, plan.order) : list;
      const kept = ordered.filter((it) => !drop.has(it.id));
      return kept.flatMap((it, i) => patch(it, kept[i + 1]?.id, list.indexOf(it) !== ordered.indexOf(it)) ?? []);
    };
    const items = fix(d.items, d.kind === "linear");
    // 순서·시작 시각이 바뀌면 식사 맞춤 자유시간을 다시 계산한다 (중간·끝에 항공이 있는 날은 출발 시각이 어긋나지 않게 그대로)
    const flightLater = items.some((it, i) => it.type === "flight" && items.slice(0, i).some((p) => p.type !== "flight"));
    const meeting = o.meetingTime ?? dayMeetingTime(d);
    const refit = d.kind === "linear" && (o.useBest || o.meetingTime) && !flightLater;
    return {
      ...d,
      ...(o.meetingTime ? { meetingTime: o.meetingTime } : {}),
      items: refit ? refitMealWindows(items, meeting) : items,
      amGuided: fix(d.amGuided, false),
      pmFreeOptions: d.pmFreeOptions.map(p => ({ ...p, items: fix(p.items, false) })),
    };
  });
}

/** 추천 변경안의 한 단계 (서버 lib/server/engineAlternatives의 AlternativeStep과 같은 형태) */
export interface AlternativeStepLike {
  id: string;
  kept: boolean;
  name: string;
  type: "sightseeing" | "experience" | "meal" | "free_time" | "shopping" | "massage";
  stayMinutes: number;
  entryFee: number;
  mealCost: number;
  cuisine: string;
  description: string;
}

/**
 * 고른 추천 변경안으로 그날 일정을 바꾼다.
 *  - 지금 있던 항목은 그대로(금액·메모 유지) 순서만 바꾸고, 새 장소는 새 항목(AI 추정 표시)으로 넣는다.
 *  - 항공 항목은 엔진 대상이 아니라 원래 앞·뒤 자리에 그대로 둔다.
 *  - 세미투어 날은 점심까지를 오전 가이드 일정, 그 뒤를 선택한 오후 코스로 나눈다.
 *  - 마지막으로 엔진 결과의 이동 시간·장소 정보(영업시간 주의)를 채운다.
 */
export function applyAlternative(
  days: DayPlan[],
  dayNo: number,
  alt: { steps: AlternativeStepLike[]; result: PlanResponse },
  pmChoice: PmChoice,
): DayPlan[] {
  const day = days.find((d) => d.day === dayNo);
  if (!day) return days;
  const existing = new Map(engineItems(day, pmChoice).map((i) => [i.id, i]));
  const list: ItineraryItem[] = alt.steps.map((s) => {
    const kept = s.kept ? existing.get(s.id) : undefined;
    if (kept) return s.stayMinutes > 0 && s.stayMinutes !== kept.stayMinutes ? { ...kept, stayMinutes: s.stayMinutes } : kept;
    return {
      id: s.id,
      type: s.type,
      admission: s.type === "meal" || s.type === "free_time" ? "none" : "unknown",
      name: s.name,
      description: s.description,
      stayMinutes: s.stayMinutes,
      travelMinutesToNext: null,
      entryFee: s.entryFee,
      mealCost: s.mealCost,
      isEstimated: true,
      ...(s.cuisine ? { cuisine: s.cuisine } : {}),
    };
  });

  let next: DayPlan;
  if (day.kind === "linear") {
    const isFlight = (i: ItineraryItem) => i.type === "flight";
    const firstNon = day.items.findIndex((i) => !isFlight(i));
    const lastNon = day.items.length - 1 - [...day.items].reverse().findIndex((i) => !isFlight(i));
    const leading = firstNon < 0 ? day.items : day.items.slice(0, firstNon).filter(isFlight);
    const trailing = firstNon < 0 ? [] : day.items.slice(lastNon + 1).filter(isFlight);
    next = { ...day, items: [...leading, ...list, ...trailing] };
  } else {
    const mealAt = list.findIndex((i) => i.type === "meal");
    const cut = mealAt >= 0 ? mealAt + 1 : Math.min(list.length, day.amGuided.length);
    const pmId = pmChoice[day.day] ?? day.pmFreeOptions[0]?.id;
    next = {
      ...day,
      amGuided: list.slice(0, cut),
      pmFreeOptions: day.pmFreeOptions.map((o) => (o.id === pmId ? { ...o, items: list.slice(cut) } : o)),
    };
  }
  const replaced = days.map((d) => (d.day === dayNo ? next : d));
  return applyDayResult(replaced, dayNo, alt.result, { useBest: false });
}
