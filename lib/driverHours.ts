import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan } from "@/types";

/**
 * 기사 연속 운전 — 국내 「여객자동차 운수사업법」 시행규칙의 전세버스 기준: 4시간 연속 운전하면 30분 이상 쉬어야 한다(15분 단위로 나눠 쉴 수 있음).
 * 해외는 나라마다 규정이 달라, 같은 기준으로 '확인 필요'를 알린다.
 * 손님이 관광하는 동안(15분 이상 머무는 곳)은 기사도 쉬는 시간으로 본다. 비행 구간은 운전이 아니다.
 */
export const MAX_CONTINUOUS_DRIVE = 240;
export const REQUIRED_REST = 30;
const REST_UNIT = 15;

export interface DriveWarning {
  /** 쉬지 않고 이어진 운전 (분) */
  minutes: number;
  /** 그 구간 첫 출발지와 마지막 도착지 */
  from: string;
  to: string;
}

export function continuousDriving(day: DayPlan, pmChoice: PmChoice): DriveWarning[] {
  const items = dayItems(day, pmChoice);
  const out: DriveWarning[] = [];
  let drive = 0;
  let rest = 0;
  let from = "";
  items.forEach((it, i) => {
    const next = items[i + 1];
    // 이 항목에 머무는 시간이 15분 이상이면 쉬는 시간으로 센다 (30분이 차면 연속 운전이 끝난다)
    if (it.type !== "flight" && it.stayMinutes >= REST_UNIT) {
      rest += Math.floor(it.stayMinutes / REST_UNIT) * REST_UNIT;
      if (rest >= REQUIRED_REST) {
        drive = 0;
        rest = 0;
      }
    }
    if (!next || it.type === "flight" || next.type === "flight") return;
    const leg = Math.max(0, it.travelMinutesToNext ?? 0);
    if (leg === 0) return;
    if (drive === 0) from = it.name;
    drive += leg;
    if (drive > MAX_CONTINUOUS_DRIVE) {
      const last = out[out.length - 1];
      if (last && last.from === from) {
        last.minutes = drive;
        last.to = next.name;
      } else out.push({ minutes: drive, from, to: next.name });
    }
  });
  return out;
}
