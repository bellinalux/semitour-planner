/**
 * 코스 엔진 공통 형식 — 세미투어와 상세페이지 스튜디오가 같이 쓴다(앱별 데이터 구조와 무관).
 * 시각은 하루 0시부터의 분(0~1440+), 글자 시각은 "HH:MM".
 */
export type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

export type PlaceKind = "sight" | "meal" | "meeting" | "end" | "free" | "transfer";
export type BestTime = "morning" | "afternoon" | "sunset" | "night" | "";

export interface EnginePlace {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  /** 머무는 시간(분) */
  stayMin: number;
  kind?: PlaceKind;
  /** 요일별 영업시간 "09:00-18:00"(여러 구간은 쉼표) | "closed" | "24h" | "" 모름 */
  open?: Partial<Record<DayKey, string>>;
  /** 마지막 입장 "17:00" */
  lastEntry?: string;
  /** 예약 입장 시각 "13:30" (그 시각에 맞춰 도착) */
  fixedTime?: string;
  /** 가장 좋은 시간대 */
  best?: BestTime;
  /** 1 꼭 · 2 가능하면 · 3 있으면 좋음 (못 넣으면 3부터 뺀다) */
  priority?: 1 | 2 | 3;
  /** 출발·해산처럼 순서가 정해진 곳 */
  fixedOrder?: "first" | "last";
  /** 식사 종류 (kind가 meal일 때) — 점심·저녁은 시간대를 지키고, 카페·간식은 시간대가 없다. 없으면 점심으로 본다 */
  meal?: "lunch" | "dinner" | "cafe";
  /** 걸어서 함께 도는 구역 이름 — 같은 구역은 명소 하나로 센다 */
  area?: string;
  /** 구역이 속한 큰 지역 (예: 마카오 반도) — 떠났던 지역으로 되돌아오면 지그재그 */
  region?: string;
}

export type MoveMode = "car" | "walk" | "public";
export type Audience = "any" | "couple" | "family" | "senior" | "group";

export interface EngineOptions {
  /** 첫 코스 시작 "09:00" */
  start: string;
  /** 요일 0(일)~6(토). 모르면 영업시간 요일 검사 안 함 */
  weekday?: number;
  /** 하루 끝 상한 "18:30" */
  maxEnd?: string;
  /** 점심 시간대 */
  lunch?: { from: string; to: string };
  /** 저녁 시간대 */
  dinner?: { from: string; to: string };
  /** 앱 일정표에서 확인된 이동 구간("출발id>도착id") — 이동 여유(bufferMin)를 따로 더하지 않는다 */
  exactLegs?: string[];
  /** 항공 등으로 시작 시각이 정해진 날 — "출발 당기기"를 제안하지 않는다 */
  fixedStart?: boolean;
  /** 숙소가 있는 지역 — 먼 곳을 먼저 돌고 숙소 쪽은 하루 끝에 (숙소 쪽에서 시작해 멀리 갔다가 돌아오면 작은 벌점) */
  homeRegion?: string;
  mode: MoveMode;
  audience?: Audience;
  /** 일몰 "19:42" (best=sunset 장소를 그 전에) */
  sunset?: string;
  /** 이동 사이 여유(분) */
  bufferMin?: number;
}

export interface TimelineStop {
  id: string;
  name: string;
  /** 도착 · 시작(대기 뒤) · 끝 (분) */
  arrive: number;
  start: number;
  end: number;
  travelFromPrev: number;
  wait: number;
  issues: string[];
}

export interface ScheduleResult {
  order: string[];
  timeline: TimelineStop[];
  /** 지켜야 하는 조건을 어긴 것(휴무·마감 뒤 도착 등) */
  violations: string[];
  /** 떠났던 구역으로 되돌아온 곳 (지그재그 동선) */
  zigzag?: string[];
  /** 되돌아온 장소 id (zigzag와 같은 순서) */
  zigzagIds?: string[];
  /** 숙소 쪽 지역을 먼저 돌고 먼 지역으로 떠났는지 */
  homeFirst?: boolean;
  /** 넣지 못해 뺀 곳과 이유 */
  dropped: { id: string; name: string; reason: string }[];
  totalTravel: number;
  totalWait: number;
  endTime: number;
  /** 원래 순서보다 이동 시간이 줄었는지 */
  savedTravel: number;
  method: "exhaustive" | "heuristic";
}

export interface QualityItem {
  key: "time" | "route" | "density" | "stamina" | "meal";
  label: string;
  score: number;
  max: number;
  issues: string[];
}
export interface QualityFix {
  type: "reorder" | "drop" | "shiftStart" | "addMeal" | "addBreak" | "shortenStay";
  label: string;
  /** reorder: 새 순서 / drop: 뺄 id / shiftStart: 새 시작 "HH:MM" */
  order?: string[];
  id?: string;
  start?: string;
}
export interface QualityReport {
  score: number;
  grade: "A" | "B" | "C" | "D";
  items: QualityItem[];
  fixes: QualityFix[];
}
