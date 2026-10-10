import { applyDayMove, blockMinutes, roomOf } from "@/lib/dayBalance";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem, TripInput } from "@/types";

/**
 * 휴무일 피하기 — 출발일로 날마다 요일을 정하고, 코스 점검이 찾은 영업시간에서 그 요일이 휴무인 곳을 찾는다.
 * 같은 숙박 도시의 다른 날 중 그곳이 문을 열고 여유가 있는 날로 옮기는 안을 만든다 (쉬게 둔 날·마지막 항공일 제외).
 * 영업시간을 모르는 곳(코스 점검 전)은 판단하지 않는다.
 */

const KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type Key = (typeof KEYS)[number];
const KO = ["일", "월", "화", "수", "목", "금", "토"];

/** DAY n의 요일 (출발일을 모르면 null) */
export function weekdayOf(input: Pick<TripInput, "departureDate">, dayNo: number): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.departureDate)) return null;
  const d = new Date(`${input.departureDate}T00:00:00Z`);
  return (d.getUTCDay() + dayNo - 1) % 7;
}

const isClosed = (it: ItineraryItem, w: number) => /closed|휴무|휴관/i.test(it.openHours?.[KEYS[w] as Key] ?? "");
const isOpen = (it: ItineraryItem, w: number) => {
  const v = (it.openHours?.[KEYS[w] as Key] ?? "").trim();
  return v !== "" && !/closed|휴무|휴관/i.test(v);
};

export interface ClosedIssue {
  day: number;
  itemId: string;
  name: string;
  /** 휴무 요일 ("월") */
  weekday: string;
  /** 옮길 날 (없으면 null) */
  toDay: number | null;
  /** 옮긴 일정 (옮길 날이 없으면 없음) */
  days?: DayPlan[];
  /** 옮기지 못하는 이유 */
  blocked?: string;
}

export function closedIssues(input: Pick<TripInput, "departureDate">, days: DayPlan[], pmChoice: PmChoice): ClosedIssue[] {
  const out: ClosedIssue[] = [];
  const last = days[days.length - 1];
  for (const d of days) {
    const w = weekdayOf(input, d.day);
    if (w === null) return [];
    for (const it of dayItems(d, pmChoice)) {
      if (!isClosed(it, w)) continue;
      const base: ClosedIssue = { day: d.day, itemId: it.id, name: it.name, weekday: KO[w], toDay: null };
      if (d.kind !== "linear") {
        out.push({ ...base, blocked: "오전·오후로 나뉜 날이라 직접 바꿔 주세요" });
        continue;
      }
      const minutes = blockMinutes([it]);
      const target = days
        .filter((t) => t.day !== d.day && t.kind === "linear" && !t.rest && (t.overnightCity ?? "") === (d.overnightCity ?? "") && !(t === last && t.items.some((x) => x.type === "flight")))
        .filter((t) => {
          const tw = weekdayOf(input, t.day);
          return tw !== null && isOpen(it, tw);
        })
        .map((t) => ({ t, room: roomOf(t, pmChoice) }))
        .filter((x) => x.room >= minutes)
        .sort((a, b) => b.room - a.room)[0];
      if (!target) {
        out.push({ ...base, blocked: "문을 여는 날 중 여유가 있는 날이 없습니다 — 빼거나 대체 장소를 넣으세요" });
        continue;
      }
      out.push({ ...base, toDay: target.t.day, days: applyDayMove(days, { fromDay: d.day, toDay: target.t.day, itemIds: [it.id], label: "", minutes }) });
    }
  }
  return out;
}
