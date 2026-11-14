/**
 * 코스 시간·구성 기준 — 대형 여행사 패키지 관행과 여행 일정 서비스 조사를 바탕으로 한 점검과 고치기 (AI를 쓰지 않는다).
 *  ① 장소 종류별 표준 체류 시간표 — AI 추정이 범위를 크게 벗어나면 알리고 표준값으로 맞춘다
 *  ② 단체 여유 시간 — 15명 이상이면 장소마다 승하차·인원 확인·화장실 (대형버스는 주차장 도보까지)
 *  ⑥ 체류 시간 근거 — 웹 확인 / 직접 입력 / 지식 창고 / 타사 표기 / 표준표 / AI 추정
 *  ⑦ 기사 하루 구속 시간 — 일본 전세버스 1일 13시간 (2024 개선기준 고시, 실제 적용은 업체 확인)
 *  ⑧ 하루 여유 — 긴 관광일인데 여유(자유시간)가 10%도 없으면 "지연에 약함"
 *  ⑩ 한 방향 동선 — 숙박 도시가 되돌아오는지, 장거리 이동일 다음 날, 마지막 밤과 귀국 공항 거리
 *  ⑯ 료칸 숙박일 — 체크인 뒤 관광 없음, 다음 날 09:00 이후 출발
 */
import { km } from "@/lib/courseEngine/time";
import { isCoord } from "@/lib/coords";
import { dayMeetingTime, dayTourStart, formatClock, parseClock, walkTimeline } from "@/lib/dayLoad";
import { formatDuration } from "@/lib/format";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { mealSlotOf } from "@/lib/mealSlot";
import type { CourseStructure, DayPlan, ItineraryItem, TripInput } from "@/types";
import { durMin } from "@/lib/courseEngine/time";
import { isShoppingCenter, isSpecialMeal } from "@/lib/packageRules";

// ── ① 장소 종류별 표준 체류 시간 ─────────────────────────────

export interface StayStandard {
  key: string;
  label: string;
  min: number;
  max: number;
}

const STANDARDS: { re: RegExp; types?: string[]; std: StayStandard }[] = [
  { re: /유니버설|디즈니|테마\s*파크|에버랜드|롯데월드|바나\s*힐|빈원더스|레고랜드|씨월드|워터\s*파크|사파리\s*월드/i, std: { key: "themepark", label: "테마파크", min: 240, max: 540 } },
  { re: /박물관|미술관|museum|gallery|기념관|전시관/i, std: { key: "museum", label: "박물관·미술관", min: 60, max: 150 } },
  { re: /야시장|시장|market|바자르/i, std: { key: "market", label: "시장", min: 40, max: 90 } },
  { re: /온천|족욕|스파|사우나/i, types: ["experience", "sightseeing", "massage"], std: { key: "onsen", label: "온천·족욕 체험", min: 20, max: 120 } },
  { re: /크루즈|유람선|뱃놀이|보트|cruise/i, std: { key: "cruise", label: "유람선·뱃놀이", min: 20, max: 180 } },
  { re: /쇼$|공연|show/i, std: { key: "show", label: "공연·쇼", min: 45, max: 150 } },
  { re: /포토|사진|전망대\s*하차|하차|차창|외관/i, std: { key: "photo", label: "하차·포토", min: 10, max: 40 } },
];

const BY_TYPE: Record<string, StayStandard> = {
  sightseeing: { key: "sight", label: "관광지", min: 20, max: 120 },
  experience: { key: "experience", label: "체험", min: 30, max: 180 },
  shopping: { key: "shopping", label: "쇼핑", min: 30, max: 120 },
  massage: { key: "massage", label: "마사지", min: 60, max: 150 },
};

/** 이 항목의 표준 체류 범위 — 식사·이동·호텔·자유시간·항공은 null */
export function stayStandard(item: ItineraryItem): StayStandard | null {
  const type = item.type ?? "sightseeing";
  if (type === "meal") {
    const slot = mealSlotOf(item);
    if (slot === "cafe") return { key: "cafe", label: "카페·디저트", min: 15, max: 50 };
    if (slot === "breakfast" || slot === null) return null;
    return isSpecialMeal(item) ? { key: "special", label: "특식", min: 50, max: 120 } : { key: "meal", label: "식사", min: 40, max: 90 };
  }
  if (!BY_TYPE[type]) return null;
  const text = `${item.name} ${item.description ?? ""}`;
  if (item.admission === "view_only") return STANDARDS.find((s) => s.std.key === "photo")!.std;
  const hit = STANDARDS.find((s) => s.re.test(item.name) && (!s.types || s.types.includes(type))) ?? STANDARDS.find((s) => s.std.key !== "photo" && s.re.test(text) && (!s.types || s.types.includes(type)));
  return hit?.std ?? BY_TYPE[type];
}

/** 근거가 있는 체류 시간은 표준표로 덮지 않는다 (웹 확인·직접 입력·지식 창고·타사 표기·시각 고정) */
const trusted = (i: ItineraryItem) => !!i.timeCheck || !!i.stayEdited || !!i.fixedTime || (i.staySource !== undefined && i.staySource !== "standard");

export interface StayIssue {
  day: number;
  item: ItineraryItem;
  std: StayStandard;
  dir: "short" | "long";
}

/** 표준 범위를 크게 벗어난 체류 (짧으면 최소의 70% 미만, 길면 최대의 130% 넘음) */
export function stayIssues(days: DayPlan[], pmChoice: PmChoice): StayIssue[] {
  const out: StayIssue[] = [];
  for (const d of days)
    for (const item of dayItems(d, pmChoice)) {
      if (trusted(item)) continue;
      const std = stayStandard(item);
      if (!std || item.stayMinutes <= 0) continue;
      if (item.stayMinutes < std.min * 0.7) out.push({ day: d.day, item, std, dir: "short" });
      else if (item.stayMinutes > std.max * 1.3) out.push({ day: d.day, item, std, dir: "long" });
    }
  return out;
}

const mapItems = (d: DayPlan, f: (i: ItineraryItem) => ItineraryItem): DayPlan => ({
  ...d,
  items: d.items.map(f),
  amGuided: d.amGuided.map(f),
  pmFreeOptions: d.pmFreeOptions.map((o) => ({ ...o, items: o.items.map(f) })),
});

/** 표준 범위 밖 체류를 가까운 끝값으로 맞춘다 (10분 단위) */
export function fitStayStandard(days: DayPlan[], pmChoice: PmChoice): DayPlan[] {
  const ids = new Map(stayIssues(days, pmChoice).map((s) => [s.item.id, s]));
  if (ids.size === 0) return days;
  const round10 = (m: number) => Math.round(m / 10) * 10;
  return days.map((d) =>
    mapItems(d, (i) => {
      const s = ids.get(i.id);
      return s ? { ...i, stayMinutes: round10(s.dir === "short" ? s.std.min : s.std.max), staySource: "standard" } : i;
    }),
  );
}

// ── ② 단체 여유 시간 ─────────────────────────────

/** 장소마다 더할 단체 여유 (분) — 15명 이상 10분, 30명 이상(대형버스) 15분 */
export function groupBufferMinutes(travelers: number): number {
  return travelers >= 30 ? 15 : travelers >= 15 ? 10 : 0;
}

const STOP_TYPES = new Set(["sightseeing", "experience", "shopping", "massage", "meal"]);

/** 아직 여유를 더하지 않은 정차 (다음 장소로 차량 이동이 있는 관광·식사) */
function bufferTargets(d: DayPlan): ItineraryItem[] {
  if (d.kind !== "linear") return [];
  return d.items.filter((i, k) => STOP_TYPES.has(i.type ?? "sightseeing") && !i.groupBuffer && k < d.items.length - 1 && (i.travelMinutesToNext ?? 0) >= 10);
}

/** 단체 여유를 다음 이동에 더한다 (한 번만 — groupBuffer 표시) */
export function applyGroupBuffer(days: DayPlan[], minutes: number): { days: DayPlan[]; count: number } {
  if (minutes <= 0) return { days, count: 0 };
  let count = 0;
  const next = days.map((d) => {
    const targets = new Set(bufferTargets(d));
    if (targets.size === 0) return d;
    count += targets.size;
    return { ...d, items: d.items.map((i) => (targets.has(i) ? { ...i, travelMinutesToNext: (i.travelMinutesToNext ?? 0) + minutes, groupBuffer: minutes } : i)) };
  });
  return { days: count ? next : days, count };
}

// ── ⑥ 체류 시간 근거 ─────────────────────────────

export function staySourceLabel(item: ItineraryItem): { label: string; tone: "ok" | "info" | "guess" } | null {
  if (!STOP_TYPES.has(item.type ?? "sightseeing") || item.stayMinutes <= 0) return null;
  if (item.stayEdited) return { label: "직접 입력", tone: "ok" };
  if (item.timeCheck) return { label: "웹 확인", tone: "ok" };
  if (item.staySource === "knowledge") return { label: "지식 창고", tone: "ok" };
  if (item.staySource === "competitor") return { label: "업체 표기", tone: "info" };
  if (item.staySource === "standard") return { label: "표준표", tone: "info" };
  return { label: "AI 추정", tone: "guess" };
}

// ── ⑦ 기사 하루 구속 시간 ─────────────────────────────

export const DUTY_LIMIT = { japan: 13 * 60 } as const;

/** 미팅부터 마지막 일정 끝까지 (차량 일정이 있는 날만) */
export function dutyMinutes(day: DayPlan, pmChoice: PmChoice): number | null {
  if (day.kind !== "linear") return null;
  const items = dayItems(day, pmChoice).filter((i) => i.type !== "flight");
  if (!items.some((i) => i.type === "transfer" || (i.travelMinutesToNext ?? 0) >= 15)) return null;
  const slots = walkTimeline(items, dayTourStart(day));
  if (slots.length === 0) return null;
  const start = parseClock(dayMeetingTime(day)) ?? slots[0].start;
  return slots[slots.length - 1].end - start;
}

// ── ⑧ 하루 여유 ─────────────────────────────

export function daySlack(day: DayPlan, pmChoice: PmChoice): { span: number; free: number } | null {
  if (day.kind !== "linear" || day.rest) return null;
  const items = dayItems(day, pmChoice);
  if (items.some((i) => i.type === "flight")) return null;
  const slots = walkTimeline(items, dayTourStart(day));
  if (slots.length < 3) return null;
  const span = slots[slots.length - 1].end - slots[0].start;
  const free = items.filter((i) => i.type === "free_time").reduce((s, i) => s + Math.max(0, i.stayMinutes), 0);
  return { span, free };
}

// ── ⑩ 한 방향 동선 ─────────────────────────────

/** 숙박 도시가 떠났다가 되돌아오는 곳 (A → B → A) */
export function overnightBacktrack(days: DayPlan[]): { city: string; via: string; day: number } | null {
  const seq: { city: string; day: number }[] = [];
  for (const d of days) {
    const c = (d.overnightCity ?? "").trim();
    if (!c) continue;
    if (seq.at(-1)?.city !== c) seq.push({ city: c, day: d.day });
  }
  for (let i = 2; i < seq.length; i++) {
    const back = seq.slice(0, i - 1).find((s) => s.city === seq[i].city);
    if (back) return { city: seq[i].city, via: seq[i - 1].city, day: seq[i].day };
  }
  return null;
}

/** 차량 이동 합계 (분) — 이동 항목 + 장소 사이 이동, 비행 제외 */
export function rideMinutes(day: DayPlan, pmChoice: PmChoice): number {
  return dayItems(day, pmChoice).reduce((s, i) => (i.type === "flight" ? s : s + Math.max(0, i.type === "transfer" ? i.stayMinutes : 0) + Math.max(0, i.travelMinutesToNext ?? 0)), 0);
}

const AIRPORTS: { re: RegExp; lat: number; lng: number; name: string }[] = [
  { re: /후쿠오카|FUK/i, lat: 33.586, lng: 130.451, name: "후쿠오카 공항" },
  { re: /간사이|KIX/i, lat: 34.432, lng: 135.23, name: "간사이 공항" },
  { re: /이타미|ITM/i, lat: 34.786, lng: 135.438, name: "이타미 공항" },
  { re: /나리타|NRT/i, lat: 35.772, lng: 140.393, name: "나리타 공항" },
  { re: /하네다|HND/i, lat: 35.549, lng: 139.78, name: "하네다 공항" },
  { re: /주부|나고야|NGO/i, lat: 34.858, lng: 136.805, name: "주부 공항" },
  { re: /신치토세|삿포로|CTS/i, lat: 42.775, lng: 141.692, name: "신치토세 공항" },
  { re: /오키나와|나하|OKA/i, lat: 26.196, lng: 127.646, name: "나하 공항" },
  { re: /가고시마|KOJ/i, lat: 31.803, lng: 130.719, name: "가고시마 공항" },
  { re: /구마모토|KMJ/i, lat: 32.837, lng: 130.855, name: "구마모토 공항" },
  { re: /오이타|OIT/i, lat: 33.479, lng: 131.737, name: "오이타 공항" },
  { re: /나가사키|NGS/i, lat: 32.917, lng: 129.914, name: "나가사키 공항" },
  { re: /다낭|DAD/i, lat: 16.044, lng: 108.199, name: "다낭 공항" },
  { re: /나트랑|깜라인|CXR/i, lat: 11.998, lng: 109.219, name: "깜라인 공항" },
  { re: /호치민|떤선녓|SGN/i, lat: 10.819, lng: 106.652, name: "떤선녓 공항" },
  { re: /하노이|노이바이|HAN/i, lat: 21.221, lng: 105.807, name: "노이바이 공항" },
  { re: /푸꾸옥|PQC/i, lat: 10.17, lng: 103.993, name: "푸꾸옥 공항" },
  { re: /수완나품|BKK/i, lat: 13.69, lng: 100.75, name: "수완나품 공항" },
  { re: /돈므앙|DMK/i, lat: 13.913, lng: 100.607, name: "돈므앙 공항" },
  { re: /푸켓|HKT/i, lat: 8.113, lng: 98.317, name: "푸켓 공항" },
  { re: /치앙마이|CNX/i, lat: 18.767, lng: 98.963, name: "치앙마이 공항" },
  { re: /세부|막탄|CEB/i, lat: 10.308, lng: 123.979, name: "막탄 공항" },
  { re: /타오위안|타이베이|TPE/i, lat: 25.08, lng: 121.234, name: "타오위안 공항" },
  { re: /홍콩|HKG/i, lat: 22.308, lng: 113.918, name: "홍콩 공항" },
  { re: /마카오|MFM/i, lat: 22.15, lng: 113.592, name: "마카오 공항" },
  { re: /싱가포르|창이|SIN/i, lat: 1.364, lng: 103.992, name: "창이 공항" },
  { re: /코타키나발루|BKI/i, lat: 5.937, lng: 116.051, name: "코타키나발루 공항" },
  { re: /발리|덴파사르|DPS/i, lat: -8.748, lng: 115.167, name: "응우라라이 공항" },
];

export function airportOf(text: string): { lat: number; lng: number; name: string } | null {
  const hit = AIRPORTS.find((a) => a.re.test(text));
  return hit ? { lat: hit.lat, lng: hit.lng, name: hit.name } : null;
}

/** 마지막 밤 숙소(또는 그날 마지막 좌표)와 귀국 공항 직선거리 (km) */
export function lastNightToAirportKm(days: DayPlan[], input: Pick<TripInput, "selectedFlight" | "selectedHotels">): { km: number; airport: string } | null {
  const f = input.selectedFlight;
  const ap = airportOf(`${f?.returnDepartAirport ?? ""}`);
  if (!ap || days.length < 2) return null;
  const night = days[days.length - 2];
  const city = (night.overnightCity ?? "").trim();
  const hotel = city ? input.selectedHotels[city] : undefined;
  const pt = hotel && isCoord(hotel.lat, hotel.lng) ? { lat: hotel.lat!, lng: hotel.lng! } : [...night.items].reverse().find((i) => isCoord(i.lat, i.lng));
  if (!pt || pt.lat === undefined || pt.lng === undefined) return null;
  return { km: Math.round(km({ lat: pt.lat, lng: pt.lng }, ap)), airport: ap.name };
}

// ── ⑯ 료칸 숙박일 ─────────────────────────────

export const RYOKAN = /료칸|旅館|ryokan|온천\s*(호텔|리조트)|온센|히젠야|가이세키/i;

/** 료칸에 묵는 날인가 (숙박 줄·고른 숙소 이름) */
export function isRyokanNight(day: DayPlan, input: Pick<TripInput, "selectedHotels">): boolean {
  const city = (day.overnightCity ?? "").trim();
  if (!city) return false;
  if (RYOKAN.test(input.selectedHotels[city]?.name ?? "")) return true;
  return day.items.some((i) => i.type === "hotel" && RYOKAN.test(i.name));
}

/** 료칸 체크인 뒤에 관광이 이어지는가 (석식·온천·휴식은 괜찮다) */
export function toursAfterRyokan(day: DayPlan): ItineraryItem[] {
  const k = day.items.findIndex((i) => i.type === "hotel" && RYOKAN.test(i.name) && !/체크아웃|조식/.test(i.name));
  if (k < 0) return [];
  return day.items.slice(k + 1).filter((i) => ["sightseeing", "experience", "shopping"].includes(i.type ?? "sightseeing") && !/온천|족욕|노천/.test(i.name));
}

// ── 하루 끝 상한 · 저녁에 놓인 조식 줄 ─────────────────────────────

export const LATE_TOUR_START = 21 * 60 + 30;
export const DAY_HARD_END = 22 * 60;
const BREAKFAST_MARK = /조식|체크\s*아웃/;

/** 다음 날로 넘겨야 할 첫 줄 — 낮 12시 뒤 조식·체크아웃 줄, 또는 21:30 뒤에 시작하는 낮 관광 (숙박·석식·야경은 제외) */
function spillStart(day: DayPlan): { index: number; reason: string; at: number } | null {
  if (day.kind !== "linear") return null;
  const slots = walkTimeline(day.items, dayTourStart(day));
  for (const s of slots) {
    const t = s.start;
    if (BREAKFAST_MARK.test(s.item.name) && s.item.type !== "flight" && t % 1440 >= 12 * 60) return { index: day.items.indexOf(s.item), reason: `${s.item.name}이 ${formatClock(t)}`, at: t };
    const night = /야경|분수|쇼|나이트|야시장|불꽃|밤|night|라이트업|온천/i.test(s.item.name);
    if (["sightseeing", "experience", "shopping"].includes(s.item.type ?? "sightseeing") && !night && t >= LATE_TOUR_START) return { index: day.items.indexOf(s.item), reason: `${s.item.name} ${formatClock(t)} 시작`, at: t };
  }
  return null;
}

/** 늦게 놓인 줄부터 끝까지를 다음 날 맨 앞으로 (숙박 줄은 이 날 끝에 남긴다) */
export function spillToNextDay(days: DayPlan[], dayNo: number): DayPlan[] {
  const i = days.findIndex((d) => d.day === dayNo);
  if (i < 0 || i >= days.length - 1) return days;
  const s = spillStart(days[i]);
  if (!s) return days;
  const d = days[i];
  const tail = d.items.slice(s.index);
  const stays = tail.filter((x) => x.type === "hotel" && !BREAKFAST_MARK.test(x.name));
  const moved = tail.filter((x) => !stays.includes(x));
  const next = days[i + 1];
  const dup = moved.length > 0 && BREAKFAST_MARK.test(moved[0].name) && next.items.length > 0 && BREAKFAST_MARK.test(next.items[0].name);
  const out = days.slice();
  out[i] = { ...d, items: [...d.items.slice(0, s.index), ...stays.map((x) => ({ ...x, travelMinutesToNext: 0 }))] };
  out[i + 1] = { ...next, items: [...moved, ...(dup ? next.items.slice(1) : next.items)] };
  return out;
}

/** 늦은 줄이 있는 날 모두 (업체 코스를 넣을 때 자동으로) */
export function spillAllLate(days: DayPlan[]): { days: DayPlan[]; moved: number[] } {
  let out = days;
  const moved: number[] = [];
  for (const d of days.slice(0, -1)) {
    const cur = out.find((x) => x.day === d.day)!;
    if (!spillStart(cur)) continue;
    out = spillToNextDay(out, d.day);
    moved.push(d.day);
  }
  return { days: out, moved };
}

// ── 고치기 ─────────────────────────────

export type CourseFix =
  | { kind: "stay-standard" }
  | { kind: "group-buffer"; minutes: number }
  | { kind: "meeting"; days: number[]; time: string }
  | { kind: "spill"; day: number };

export function applyCourseFix(fix: CourseFix, days: DayPlan[], pmChoice: PmChoice): DayPlan[] {
  if (fix.kind === "stay-standard") return fitStayStandard(days, pmChoice);
  if (fix.kind === "group-buffer") return applyGroupBuffer(days, fix.minutes).days;
  if (fix.kind === "spill") return spillToNextDay(days, fix.day);
  return days.map((d) => (fix.days.includes(d.day) ? { ...d, meetingTime: fix.time } : d));
}

export interface CourseCheck {
  id: string;
  tone: "warn" | "info";
  title: string;
  detail?: string;
  fix?: { fix: CourseFix; label: string };
}

/** 코스 시간·구성 점검 — 요약·추천(insights)에 들어간다 */
export function courseChecks(input: Pick<TripInput, "travelers" | "selectedFlight" | "selectedHotels" | "destination">, days: DayPlan[], pmChoice: PmChoice, opts: { region?: string } = {}): CourseCheck[] {
  const out: CourseCheck[] = [];
  if (days.length === 0) return out;

  // 하루 끝 상한 — 저녁에 놓인 조식 줄·21:30 넘어 시작하는 낮 관광은 다음 날 일정이 이 날에 들어간 것
  for (const d of days.slice(0, -1)) {
    const sp = spillStart(d);
    if (sp)
      out.push({
        id: `spill-${d.day}`,
        tone: "warn",
        title: `DAY ${d.day} ${sp.reason} — 다음 날 일정이 이 날에 들어간 것 같습니다`,
        detail: "숙박 체크인이 한밤중이 됩니다. 그 줄부터 끝까지를 다음 날 아침으로 옮깁니다 (숙박은 이 날 끝에 남김)",
        fix: { fix: { kind: "spill", day: d.day }, label: `DAY ${d.day + 1} 아침으로 옮기기` },
      });
    else {
      const items = dayItems(d, pmChoice);
      const slots = walkTimeline(items, dayTourStart(d));
      const lastNonHotel = [...slots].reverse().find((x) => x.item.type !== "hotel");
      const hotel = slots.find((x) => x.item.type === "hotel" && !BREAKFAST_MARK.test(x.item.name) && x === slots[slots.length - 1]);
      const end = hotel?.start ?? lastNonHotel?.end;
      if (end !== undefined && end > DAY_HARD_END)
        out.push({ id: `late-${d.day}`, tone: "warn", title: `DAY ${d.day} ${hotel ? "호텔 도착" : "일정 끝"} ${formatClock(end)}`, detail: "22시를 넘깁니다. 단체 일정은 21시 전후 호텔 도착이 기준입니다 — 관광을 다음 날로 옮기거나 선택관광으로 빼세요" });
    }
  }

  // ① 표준 체류
  const stays = stayIssues(days, pmChoice);
  if (stays.length > 0) {
    const show = stays.slice(0, 4).map((s) => `DAY ${s.day} ${s.item.name} ${s.item.stayMinutes}분(${s.std.label} ${s.std.min}~${s.std.max}분)`);
    out.push({
      id: "stay-standard",
      tone: "warn",
      title: `체류 시간이 표준과 크게 다른 곳 ${stays.length}개`,
      detail: `${show.join(" · ")}${stays.length > 4 ? " …" : ""} — 웹 확인·직접 입력·업체 표기 시간은 그대로 둡니다`,
      fix: { fix: { kind: "stay-standard" }, label: "표준 시간으로 맞추기" },
    });
  }

  // ② 단체 여유
  const buffer = groupBufferMinutes(input.travelers);
  const targets = days.reduce((s, d) => s + bufferTargets(d).length, 0);
  if (buffer > 0 && targets > 0)
    out.push({
      id: "group-buffer",
      tone: "warn",
      title: `${input.travelers}명 단체 여유 시간 빠짐 — 장소 ${targets}곳`,
      detail: `장소마다 승하차·인원 확인·화장실로 ${buffer}분씩${input.travelers >= 30 ? " (대형버스 주차장 도보 포함)" : ""} 더합니다. 하루 5곳이면 ${buffer * 5}분이 밀립니다`,
      fix: { fix: { kind: "group-buffer", minutes: buffer }, label: `+${buffer}분씩 더하기` },
    });

  // ⑦ 일본 전세버스 하루 구속 13시간
  if (opts.region === "japan") {
    const over = days.map((d) => ({ d, m: dutyMinutes(d, pmChoice) })).filter((x) => x.m !== null && x.m > DUTY_LIMIT.japan);
    if (over.length > 0)
      out.push({
        id: "duty-japan",
        tone: "warn",
        title: `기사 하루 구속 13시간 초과 — ${over.map((x) => `DAY ${x.d.day} ${formatDuration(x.m!)}`).join(", ")}`,
        detail: "일본 전세버스 기사는 미팅부터 해산까지 하루 13시간(연장 시 최대 15시간, 주 2회)이 기준입니다. 일정을 줄이거나 기사 교대·추가 요금을 업체에 확인하세요",
      });
  }

  // ⑧ 하루 여유
  const tight = days.map((d) => ({ d, s: daySlack(d, pmChoice) })).filter((x) => x.s && x.s.span >= 8 * 60 && x.s.free < x.s.span * 0.1);
  if (tight.length > 0)
    out.push({
      id: "slack",
      tone: "info",
      title: `여유 시간이 거의 없는 날 — ${tight.map((x) => `DAY ${x.d.day}`).join(", ")}`,
      detail: `관광 ${tight.map((x) => formatDuration(x.s!.span)).join("·")} 동안 자유·여유가 10%도 안 됩니다. 단체는 지연이 쌓이니 30~60분 여유(자유시간·카페)를 두세요`,
    });

  // ⑩ 한 방향 동선
  const back = overnightBacktrack(days);
  if (back)
    out.push({
      id: "backtrack",
      tone: "info",
      title: `숙박 도시가 되돌아옵니다 — ${back.city} → ${back.via} → ${back.city} (DAY ${back.day})`,
      detail: "대형사 상품은 숙박 도시를 귀국 공항 쪽으로 한 방향으로 옮깁니다. 연박이 목적이 아니면 순서를 바꿔 이동을 줄이세요",
    });
  for (let i = 0; i < days.length - 1; i++) {
    const ride = rideMinutes(days[i], pmChoice);
    if (ride < 240) continue;
    const next = days[i + 1];
    const meet = parseClock(dayMeetingTime(next)) ?? 0;
    const nextFlight = next.items.some((x) => x.type === "flight");
    if (!nextFlight && meet < 9 * 60)
      out.push({
        id: `long-ride-${days[i].day}`,
        tone: "info",
        title: `DAY ${days[i].day} 차량 이동 ${formatDuration(ride)} — 다음 날은 가볍게`,
        detail: `장거리 이동일 다음 날(DAY ${next.day}) 미팅이 ${dayMeetingTime(next)}입니다. 09:00 이후 출발·하루 3곳 이내로`,
        fix: { fix: { kind: "meeting", days: [next.day], time: "09:00" }, label: `DAY ${next.day} 09:00 출발` },
      });
  }
  const far = lastNightToAirportKm(days, input);
  if (far && far.km > 100)
    out.push({
      id: "last-night-far",
      tone: "warn",
      title: `마지막 밤 숙소가 ${far.airport}에서 약 ${far.km}km`,
      detail: "출국일에 공항 3시간 전 도착까지 장거리 이동이 남습니다. 마지막 밤은 귀국 공항에서 1시간 30분 안쪽(약 100km) 도시로 옮기는 것이 대형사 관행입니다",
    });

  // ⑯ 료칸
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (!isRyokanNight(d, input)) continue;
    const after = toursAfterRyokan(d);
    if (after.length > 0)
      out.push({
        id: `ryokan-after-${d.day}`,
        tone: "warn",
        title: `DAY ${d.day} 료칸 체크인 뒤 관광 ${after.length}곳`,
        detail: `${after.map((x) => x.name).join(", ")} — 료칸 숙박일은 15~16시 체크인, 석식(가이세키)·온천으로 끝냅니다`,
      });
    const slots = walkTimeline(d.items, dayTourStart(d));
    const stay = slots.find((s) => s.item.type === "hotel" && RYOKAN.test(s.item.name));
    if (stay && stay.start > 16 * 60 + 30 && stay.start <= 18 * 60)
      out.push({ id: `ryokan-late-${d.day}`, tone: "info", title: `DAY ${d.day} 료칸 도착 ${formatClock(stay.start)}`, detail: "온천을 즐기도록 15~16시 체크인이 좋습니다 (석식은 보통 18:00)" });
    const next = days[i + 1];
    if (next && !next.items.some((x) => x.type === "flight" && next.items.indexOf(x) === 0) && (parseClock(dayMeetingTime(next)) ?? 0) < 9 * 60)
      out.push({
        id: `ryokan-next-${next.day}`,
        tone: "info",
        title: `료칸 다음 날(DAY ${next.day}) 미팅 ${dayMeetingTime(next)}`,
        detail: "료칸 조식·아침 온천 뒤 09:00~09:30 출발이 관행입니다",
        fix: { fix: { kind: "meeting", days: [next.day], time: "09:00" }, label: `DAY ${next.day} 09:00 출발` },
      });
  }
  return out;
}

// ── ⑮ 타사 상품 구성과 비교 ─────────────────────────────

const TOUR = (i: ItineraryItem) => ["sightseeing", "experience"].includes(i.type ?? "sightseeing");

/** 우리 코스의 구성 숫자 */
export function courseStructure(days: DayPlan[], pmChoice: PmChoice): CourseStructure {
  const tourDays = days.filter((d) => dayItems(d, pmChoice).some(TOUR));
  const all = days.flatMap((d) => dayItems(d, pmChoice));
  const places = tourDays.reduce((s, d) => s + dayItems(d, pmChoice).filter(TOUR).length, 0);
  const ride = tourDays.reduce((s, d) => s + rideMinutes(d, pmChoice), 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    placesPerDay: tourDays.length ? r1(places / tourDays.length) : 0,
    ridePerDay: tourDays.length ? Math.round(ride / tourDays.length) : 0,
    specialMeals: all.filter(isSpecialMeal).length,
    shopping: all.filter(isShoppingCenter).length,
  };
}

/**
 * 상품 페이지 일정 원문에서 구성 숫자 — 관광지 줄("[관광지]"·"▶")·이동 소요("이동 … 약 1시간 30분 소요")·특식 줄을 센다.
 * 원문에 표시가 없으면 주요 방문지 수로 어림한다.
 */
export function textStructure(text: string, opts: { days: number; mustSee?: number; shopping?: number }): CourseStructure {
  const lines = text.split(/\r?\n/);
  const tourDays = Math.max(1, opts.days > 2 ? opts.days - 1 : opts.days);
  const sights = lines.filter((l) => /^\s*\[관광지\]|^\s*▶/.test(l)).length;
  const ride = lines.filter((l) => /이동/.test(l) && /소요/.test(l)).reduce((s, l) => s + (durMin(l) ?? 0), 0);
  const special = new Set(lines.filter((l) => /특식/.test(l)).map((l) => l.trim())).size;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    placesPerDay: r1((sights || opts.mustSee || 0) / tourDays),
    ridePerDay: Math.round(ride / tourDays),
    specialMeals: special,
    shopping: opts.shopping ?? -1,
  };
}

/** 타사 평균과 우리 비교 한 줄 (타사 구성 숫자가 있는 것만) */
export function structureCompare(ours: CourseStructure, others: CourseStructure[]): { line: string; ours: string } | null {
  if (others.length === 0) return null;
  const avg = (f: (x: CourseStructure) => number, list = others) => list.reduce((s, x) => s + f(x), 0) / list.length;
  const shopKnown = others.filter((x) => x.shopping >= 0);
  const rides = others.filter((x) => x.ridePerDay > 0);
  const fmt = (x: { placesPerDay: number; ridePerDay: number; specialMeals: number; shopping: number }) =>
    [`하루 ${Math.round(x.placesPerDay * 10) / 10}곳`, x.ridePerDay > 0 ? `하루 이동 ${formatDuration(Math.round(x.ridePerDay))}` : "", `특식 ${Math.round(x.specialMeals * 10) / 10}회`, x.shopping >= 0 ? `쇼핑 ${Math.round(x.shopping * 10) / 10}회` : ""].filter(Boolean).join(" · ");
  return {
    line: `타사 평균(${others.length}개): ${fmt({ placesPerDay: avg((x) => x.placesPerDay), ridePerDay: rides.length ? avg((x) => x.ridePerDay, rides) : 0, specialMeals: avg((x) => x.specialMeals), shopping: shopKnown.length ? avg((x) => x.shopping, shopKnown) : -1 })}`,
    ours: `우리: ${fmt(ours)}`,
  };
}
