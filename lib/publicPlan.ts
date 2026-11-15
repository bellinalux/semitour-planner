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

// ── 여행 방식 5가지 · 우리가 해 드릴 것 ──

export const STYLE_IDS = ["package", "semi", "free_tour", "airtel", "backpack"] as const;
export type TravelStyle = (typeof STYLE_IDS)[number];
export const SERVICE_IDS = ["flight", "hotel", "transfer", "tour", "guide", "meals", "pass", "esim", "insurance"] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

export const SERVICE_LABEL: Record<ServiceId, string> = {
  flight: "항공권", hotel: "호텔", transfer: "공항 픽업·샌딩", tour: "현지 투어", guide: "전용차량·가이드", meals: "식사", pass: "교통패스", esim: "eSIM·유심", insurance: "여행자보험",
};

export const STYLES: Record<TravelStyle, { label: string; icon: string; desc: string; services: ServiceId[]; guided: boolean; model: "full" | "semi" | "airtel" | "backpack" }> = {
  package: { label: "패키지", icon: "🚌", desc: "항공·호텔·가이드·전용차량·식사까지 모두", services: ["flight", "hotel", "transfer", "guide", "meals", "insurance"], guided: true, model: "full" },
  semi: { label: "세미패키지", icon: "🧭", desc: "핵심 관광일은 가이드, 나머지는 자유", services: ["flight", "hotel", "transfer", "guide", "insurance"], guided: true, model: "semi" },
  free_tour: { label: "자유여행 + 투어 추가", icon: "✈", desc: "항공·호텔 + 고른 날만 현지 투어, 나머지는 셀프 코스", services: ["flight", "hotel", "tour", "esim", "insurance"], guided: false, model: "airtel" },
  airtel: { label: "항공+호텔만", icon: "🏨", desc: "항공·호텔 예약 + 이동 안내서 (투어 없음)", services: ["flight", "hotel", "esim"], guided: false, model: "airtel" },
  backpack: { label: "배낭여행", icon: "🎒", desc: "대중교통·도보 중심, 필요한 것만", services: ["esim", "pass"], guided: false, model: "backpack" },
};
/** 기본: 요즘 수요가 가장 많이 늘고 있는 "자유여행 + 투어 추가" (에어텔 + 고른 날 현지 투어) */
export const DEFAULT_STYLE: TravelStyle = "free_tour";
/** 가이드 없이 고객이 직접 다니는 코스 (교통편 설명을 붙인다) */
export const isSelfGuided = (style: TravelStyle) => !STYLES[style].guided;

/** 직원 화면 [이 코스로 견적 시작] — 고객이 고른 방식·맡길 것을 견적 입력으로 */
export function styleToTripPatch(style: TravelStyle | undefined, services: ServiceId[] | undefined): Partial<TripInput> {
  if (!style) return {};
  const sv = services ?? STYLES[style].services;
  return {
    operatingModel: STYLES[style].model,
    includesFlights: sv.includes("flight"),
    packageType: sv.includes("flight") ? "full" : sv.includes("hotel") ? "land_hotel" : "land",
  };
}

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
  /** 여행 방식 — 패키지 / 세미 / 자유여행+투어 / 항공+호텔만 / 배낭 */
  style: z.enum(STYLE_IDS).default(DEFAULT_STYLE),
  /** 우리가 해 드릴 것 (견적 범위) */
  services: z.array(z.enum(SERVICE_IDS)).max(SERVICE_IDS.length).default([]),
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
  priceTable: { match: string; text: string; style?: TravelStyle }[];
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
          .slice(0, 80)
          .map((x) => ({ match: x.match.trim().slice(0, 40), text: x.text.trim().slice(0, 120), ...(x.style && (STYLE_IDS as readonly string[]).includes(x.style) ? { style: x.style } : {}) }))
      : [],
    notice: typeof s.notice === "string" ? s.notice.slice(0, 300) : "",
    notifyEmail: typeof s.notifyEmail === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.notifyEmail.trim()) ? s.notifyEmail.trim().slice(0, 120) : "",
  };
}

/** 여행지(와 여행 방식)에 맞는 경비 안내 — 방식이 적힌 줄이 먼저, 없으면 방식 없는 줄 (표시 설정이 켜져 있을 때만) */
export function priceNoteFor(settings: Pick<PublicPlanSettings, "showPrice" | "priceTable">, destination: string, style?: TravelStyle): string {
  if (!settings.showPrice) return "";
  const hits = settings.priceTable.filter((p) => destination.includes(p.match));
  return (style ? hits.find((p) => p.style === style) : undefined)?.text ?? hits.find((p) => !p.style)?.text ?? "";
}

/** 관리자 경비 표 한 줄 "후쿠오카 | 항공+호텔만 | 1인 35만~" 또는 "후쿠오카 | 1인 69만~" */
export function parsePriceLine(line: string): { match: string; text: string; style?: TravelStyle } | null {
  const parts = line.split("|").map((x) => x.trim());
  if (parts.length < 2 || !parts[0]) return null;
  const style = STYLE_IDS.find((id) => STYLES[id].label === parts[1] || id === parts[1]);
  if (style && parts.length >= 3) return { match: parts[0], style, text: parts.slice(2).join(" | ") };
  return { match: parts[0], text: parts.slice(1).join(" | ") };
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
    operatingModel: STYLES[req.style].model,
    productTier: "standard",
    selectedFlight: null,
  } as TripInput;
  // 항공을 맡기지 않으면(배낭 등) 항공 시각 규칙을 쓰지 않는다 — 단, 고객이 항공 시각을 적었으면 그 시각으로
  if (!req.services.includes("flight") && !(req.arrive && req.returnDepart)) base.includesFlights = req.style !== "backpack" && req.days >= 2;
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
  return { ...rest, mustSee: [...rest.mustSee].sort(), themes: [...rest.themes].sort(), companions: [...rest.companions].sort(), services: [...rest.services].sort() };
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

/** "○○ 꼭 가볼 곳" 한 곳 — 어느 여행 방식이든 보여 준다 */
export interface MustSpot {
  name: string;
  area: string;
  kind: "sight" | "meal" | "activity" | "shopping" | "night";
  /** 왜 가는지 한 줄 */
  why: string;
  tips: string[];
  stayMin: number;
  /** 한국 여행사 일정에 자주 들어가거나 우리 고객이 좋아한 곳 */
  korean: boolean;
  lat?: number;
  lng?: number;
}
export interface MustSpots {
  city: string;
  /** 도심(가는 방법 기준점) */
  center: { lat: number; lng: number } | null;
  spots: MustSpot[];
  source: "knowledge" | "wiki" | "none";
}
