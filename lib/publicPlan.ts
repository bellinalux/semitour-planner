/**
 * 고객용 "내 여행 코스 만들기"(/plan) — 화면과 서버가 함께 쓰는 형식·계산 (서버 전용 저장·생성은 lib/server/publicPlan.ts).
 */
import { z } from "zod";
import { DEFAULT_INPUT } from "@/lib/defaults";
import { routeInfo } from "@/lib/flightPlan";
import { formatClock, parseClock } from "@/lib/dayLoad";
import type { DayPlan, FlightOption, TripInput } from "@/types";

export const THEME_IDS = ["food", "history", "nature", "shopping", "photo", "activity", "local"] as const;
export const THEME_LABEL: Record<(typeof THEME_IDS)[number], string> = {
  food: "먹방", history: "역사·문화", nature: "자연·풍경", shopping: "쇼핑", photo: "사진 명소", activity: "체험·액티비티", local: "현지 감성",
};
export const COMPANION_LABEL = { senior: "부모님", kids: "아이", infant: "영유아", couple: "커플", friends: "친구", group: "단체" } as const;
export const PACE_LABEL = { relaxed: "여유롭게", normal: "보통", packed: "알차게" } as const;

const clock = z.string().regex(/^\d{1,2}:\d{2}$/);

export const publicPlanRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 적어 주세요.").max(60),
  /** 여러 도시 여행 — 도시와 숙박 수 (지도로 루트 짜기). 비우면 여행지 하나 */
  cities: z.array(z.object({ name: z.string().trim().min(1).max(40), nights: z.number().int().min(0).max(14) })).max(8).default([]),
  nights: z.number().int().min(0).max(14),
  days: z.number().int().min(1).max(15),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  travelers: z.number().int().min(1).max(50).default(2),
  companions: z.array(z.enum(["senior", "kids", "infant", "couple", "friends", "group"])).max(6).default([]),
  pace: z.enum(["relaxed", "normal", "packed"]).default("normal"),
  themes: z.array(z.enum(THEME_IDS)).max(7).default([]),
  mustSee: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  /** 현지 도착·귀국편 출발 시각 (알면) */
  arrive: clock.optional(),
  returnDepart: clock.optional(),
  /** 사람 확인(Turnstile) 토큰 */
  token: z.string().max(4000).optional(),
});
export type PublicPlanRequest = z.infer<typeof publicPlanRequestSchema>;

export interface PublicPlanResult {
  days: DayPlan[];
  /** knowledge: 지식 창고 인기 장소 + 코스 엔진 (AI 없음) / ai: AI 생성 / free: 위키백과 근처 장소 + 코스 엔진 (AI 없음) / cache: 같은 조건 결과 */
  source: "knowledge" | "ai" | "free" | "cache";
  note: string;
}

/** 관리자 설정 (회사 설정 → 고객 코스 만들기) */
export interface PublicPlanSettings {
  enabled: boolean;
  /** 회사 전체 하루 코스 생성 상한 */
  dailyCap: number;
  /** IP 하나당 하루 상한 */
  ipDaily: number;
  /** 지식 창고로 못 만들면 AI로 만들지 */
  aiFallback: boolean;
  /** 예상 경비 범위 표시 */
  showPrice: boolean;
  /** 여행지 글자가 들어 있으면 그 경비 안내 (예: { match: "후쿠오카", text: "1인 69만~89만 원 (2박3일, 항공 포함)" }) */
  priceTable: { match: string; text: string }[];
  /** 화면 맨 위 안내 문구 */
  notice: string;
  /** 새 견적 요청 알림 이메일 (RESEND_API_KEY가 있어야 보냄) */
  notifyEmail: string;
}

export const DEFAULT_PUBLIC_SETTINGS: PublicPlanSettings = {
  enabled: true,
  dailyCap: 100,
  ipDaily: 5,
  aiFallback: true,
  showPrice: false,
  priceTable: [],
  notice: "",
  notifyEmail: "",
};

export function normalizePublicSettings(raw: unknown): PublicPlanSettings {
  const s = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<PublicPlanSettings>;
  const n = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  return {
    enabled: s.enabled !== false,
    dailyCap: n(s.dailyCap, DEFAULT_PUBLIC_SETTINGS.dailyCap, 0, 5000),
    ipDaily: n(s.ipDaily, DEFAULT_PUBLIC_SETTINGS.ipDaily, 1, 100),
    aiFallback: s.aiFallback !== false,
    showPrice: s.showPrice === true,
    priceTable: Array.isArray(s.priceTable)
      ? s.priceTable
          .filter((x) => x && typeof x.match === "string" && typeof x.text === "string" && x.match.trim())
          .slice(0, 50)
          .map((x) => ({ match: x.match.trim().slice(0, 40), text: x.text.trim().slice(0, 120) }))
      : [],
    notice: typeof s.notice === "string" ? s.notice.slice(0, 300) : "",
    notifyEmail: typeof s.notifyEmail === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.notifyEmail.trim()) ? s.notifyEmail.trim().slice(0, 120) : "",
  };
}

/** 여행지에 맞는 경비 안내 (표시 설정이 켜져 있을 때만) */
export function priceNoteFor(settings: Pick<PublicPlanSettings, "showPrice" | "priceTable">, destination: string): string {
  if (!settings.showPrice) return "";
  return settings.priceTable.find((p) => destination.includes(p.match))?.text ?? "";
}

/** 도시 루트 → 여행지 글·도시 순서 글 ("후쿠오카 1박, 유후인 1박") */
export function regionPlanText(cities: PublicPlanRequest["cities"]): string {
  return cities.map((c) => `${c.name} ${c.nights}박`).join(", ");
}

/** 고객 요청 → 내부 입력값 (코스 규칙·항공 시각 계산을 직원 화면과 똑같이 쓰려고) */
export function toTripInput(req: PublicPlanRequest): TripInput {
  const destination = req.cities.length > 0 ? req.cities.map((c) => c.name).join(", ") : req.destination;
  const base: TripInput = {
    ...DEFAULT_INPUT,
    mode: "ai",
    destination,
    days: req.days,
    nights: req.nights,
    travelers: req.travelers,
    companions: req.companions,
    pace: req.pace,
    themes: req.themes,
    mustHave: req.mustSee.join(", ").slice(0, 300),
    regionPlan: req.cities.length > 1 ? regionPlanText(req.cities) : "",
    departureDate: req.departureDate ?? "",
    tripScope: "overseas",
    includesFlights: req.days >= 2,
    operatingModel: "private",
    productTier: "standard",
    selectedFlight: null,
  } as TripInput;
  if (req.arrive && req.returnDepart) base.selectedFlight = customerFlight(base, req.arrive, req.returnDepart);
  return base;
}

/** 고객이 아는 현지 도착·귀국편 출발 시각으로 항공편 (출발 시각은 노선 비행시간·시차로 거꾸로 어림) */
export function customerFlight(input: Pick<TripInput, "originCity" | "destination" | "departureDate">, arrive: string, returnDepart: string): FlightOption {
  const r = routeInfo(input);
  const a = parseClock(arrive) ?? 12 * 60;
  const depart = formatClock((((a - r.outMin - r.tzMin) % 1440) + 1440) % 1440);
  const back = parseClock(returnDepart) ?? 19 * 60;
  const dest = input.destination.split(/[,/]/)[0].trim();
  return {
    airline: "", flightNumber: "", departDate: input.departureDate, departAirport: "인천", departTime: depart, arriveAirport: dest, arriveTime: arrive,
    stops: 0, duration: "", price: 0, basis: "estimated", sourceName: "고객 입력", link: "",
    returnFlightNumber: "", returnDepartDate: "", returnDepartAirport: dest, returnDepartTime: returnDepart,
    returnArriveAirport: "인천", returnArriveTime: formatClock((back + r.backMin - r.tzMin + 1440) % 1440), returnStops: 0, returnDuration: "",
  };
}

/** 같은 조건이면 같은 결과를 다시 쓴다 (AI 비용 절약) — 토큰·개인 정보는 빼고 정리 */
export function cacheKeyOf(req: PublicPlanRequest): Omit<PublicPlanRequest, "token"> {
  const { token: _token, ...rest } = req;
  void _token;
  return { ...rest, mustSee: [...rest.mustSee].sort(), themes: [...rest.themes].sort(), companions: [...rest.companions].sort() };
}

/** 저장·견적 요청에 담는 코스 (사진·확인 기록 등 큰 값은 뺀다) */
export function compactDays(days: DayPlan[]): DayPlan[] {
  return days.slice(0, 15).map((d) => ({
    ...d,
    items: d.items.slice(0, 20).map((i) => ({
      id: i.id, type: i.type, name: i.name.slice(0, 80), description: (i.description ?? "").slice(0, 160), stayMinutes: i.stayMinutes,
      travelMinutesToNext: i.travelMinutesToNext, entryFee: 0, mealCost: 0, isEstimated: true,
      ...(i.mealSlot ? { mealSlot: i.mealSlot } : {}), ...(i.fixedTime ? { fixedTime: i.fixedTime } : {}),
      ...(typeof i.lat === "number" && typeof i.lng === "number" ? { lat: i.lat, lng: i.lng } : {}),
    })),
    amGuided: [],
    pmFreeOptions: [],
  }));
}
