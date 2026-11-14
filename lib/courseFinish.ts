import { applyGroupBuffer, groupBufferMinutes } from "@/lib/courseStandards";
import { fitCourse, type FitChange } from "@/lib/courseFit";
import { refitDay } from "@/lib/dayBalance";
import { tidyDays } from "@/lib/dayTidy";
import { fixImpossible } from "@/lib/feasibility";
import { packageRules, withRuleMeetings } from "@/lib/packageRules";
import type { DayPlan, TripInput } from "@/types";

/**
 * 받은 일정을 화면에 넣기 전에 다듬는다 (useItinerary.generate에서 떼어 냄 — 테스트하기 쉽게).
 *  - 늦은 식사·같은 식사 두 줄·지나치게 긴 도보 구역 정리
 *  - AI 일정: 패키지 규칙의 미팅 시각, 첫날 호텔 출발(항공 없는 일정), 불가능 시간(운영 시간 밖·출국 시각 뒤 등) 바로 고치기
 *  - 업체 코스(붙여넣기): 원문을 지키고 경고만
 */
export function finishCourse(raw: DayPlan[], input: TripInput): { days: DayPlan[]; changes: FitChange[] } {
  const tidied = tidyDays(raw);
  const rules = packageRules(input, raw.map((d) => d.overnightCity ?? ""));
  // 항공 이동일 없이 만든 AI 일정의 첫날은 호텔에서 출발한다 — 호텔 미팅 → 첫 장소 30분 (첫날 0분은 공항 도착일 기준)
  const fromHotel =
    input.mode === "ai" && !input.includesFlights && tidied[0] && tidied[0].hotelLeadMinutes === undefined && !tidied[0].items.some((i) => i.type === "flight")
      ? [{ ...tidied[0], hotelLeadMinutes: 30 }, ...tidied.slice(1)]
      : tidied;
  const ruled = input.mode === "ai" ? withRuleMeetings(fromHotel, rules) : fromHotel;
  // AI 코스는 개인 기준 시간이라 단체(15명 이상)면 장소마다 승하차·인원 확인 여유를 더한다 (업체 코스는 원문 시간 그대로 — 점검에서 안내)
  const buffered = input.mode === "ai" ? applyGroupBuffer(ruled, groupBufferMinutes(input.travelers)) : { days: ruled, count: 0 };
  const base = buffered.days;
  const fit = fitCourse(base, { walk: input.mode === "paste" });
  const fitted = tidyDays(fit.days);
  const bufferNote = buffered.count > 0 ? [{ day: 0, note: `${input.travelers}명 단체 — 장소 ${buffered.count}곳에 승하차·인원 확인 여유 ${groupBufferMinutes(input.travelers)}분씩` }] : [];
  return { days: input.mode === "ai" ? fixImpossible(fitted, {}, refitDay, rules.dayEnd).days : fitted, changes: [...bufferNote, ...fit.changes] };
}
