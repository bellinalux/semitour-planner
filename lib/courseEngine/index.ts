/**
 * 코스 엔진 — 세미투어(서버·화면)와 상세페이지 스튜디오(브라우저용으로 묶어 넣음: scripts/build-engine.mjs)가 같이 쓴다.
 * 이 폴더는 앱 데이터 구조·서버 기능에 기대지 않는 순수 계산만 둔다.
 */
import { estimateTravel } from "./time";
import { schedule, simulate } from "./schedule";
import { scoreCourse } from "./quality";
import type { EngineOptions, EnginePlace, MoveMode, QualityReport, ScheduleResult } from "./types";

export * from "./types";
export { hm, fmt, durMin, parseRange, km, estimateTravel, dayKey, hoursText } from "./time";
export { schedule, simulate } from "./schedule";
export { scoreCourse } from "./quality";
export { sunTimes, timeZoneForCountry, isoForCountry } from "./sun";

/** 좌표로 어림한 이동 시간표 (지도 길찾기를 못 쓸 때) */
export function estimateMatrix(places: EnginePlace[], mode: MoveMode): number[][] {
  return places.map(a => places.map(b => (a === b ? 0 : estimateTravel(a, b, mode))));
}

/** 지금 순서 그대로 하루를 흘려 본 결과 (빼기·순서 바꾸기 없음) */
export function scheduleAsIs(places: EnginePlace[], M: number[][], o: EngineOptions): ScheduleResult {
  const s = simulate(places.map((_, i) => i), places, M, o);
  return { order: places.map(p => p.id), timeline: s.stops, violations: s.violations, dropped: [], totalTravel: s.travel, totalWait: s.wait, endTime: s.end, savedTravel: 0, method: "exhaustive" };
}

export interface PlanResult { current: ScheduleResult; best: ScheduleResult; quality: QualityReport; bestQuality: QualityReport }

/** 지금 순서의 하루 + 엔진이 찾은 하루 + 두 쪽의 품질 점수 */
export function planDay(places: EnginePlace[], matrix: number[][], o: EngineOptions, reorder = true): PlanResult {
  const current = scheduleAsIs(places, matrix, o);
  const best = reorder ? schedule(places, matrix, o) : current;
  return { current, best, quality: scoreCourse(places, current, o, best), bestQuality: scoreCourse(places, best, o) };
}
