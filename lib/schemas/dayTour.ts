import { z } from "zod";

const CURRENCIES = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"] as const;

/** 투어 전체의 이동 방식 — mixed는 구간마다 알맞은 수단(차량·대중교통·도보)을 고른다 */
export const DAY_TOUR_TRANSPORTS = ["vehicle", "transit", "walk", "mixed"] as const;
export type DayTourTransport = (typeof DAY_TOUR_TRANSPORTS)[number];
/** 구간 하나의 이동 수단 */
export const LEG_MODES = ["vehicle", "transit", "walk"] as const;
export type LegMode = (typeof LEG_MODES)[number];

/** 근교 투어(반일·당일) 만들기 요청 */
export const dayTourRequestSchema = z.object({
  /** 출발·복귀 기준지 (호텔·역·도시) */
  base: z.string().trim().min(1, "출발 기준지를 입력해 주세요.").max(120),
  /** 가고 싶은 근교 지역 (비우면 AI가 고른다) */
  area: z.string().trim().max(120).default(""),
  length: z.enum(["half", "full"]),
  transport: z.enum(DAY_TOUR_TRANSPORTS),
  travelers: z.number().int().min(1).max(90),
  /** 테마·요청 (예: 자연·사진, 역사, 아이 동반) */
  theme: z.string().trim().max(200).default(""),
  guide: z.boolean().default(true),
  /** 당일 투어 점심 포함 */
  lunch: z.boolean().default(true),
  /** 출발 시각 "09:00" */
  start: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  /** 차량 차고지 (공차 거리 계산용, 비우면 0) */
  garage: z.string().trim().max(120).default(""),
  /** 차종 (인원으로 정한 것, 통행료·주차비 조사용) */
  vehicleClass: z.string().trim().max(40).default(""),
  currency: z.enum(CURRENCIES),
  tripScope: z.enum(["domestic", "overseas"]).default("domestic"),
});
export type DayTourRequest = z.infer<typeof dayTourRequestSchema>;

/** ---------- LLM 응답 ---------- */

const stopSchema = z.object({
  name: z.string().describe("장소 이름 (현지에서 검색 가능한 실제 이름)"),
  area: z.string().describe("장소가 있는 지역·동네 짧게"),
  kind: z.enum(["sight", "meal", "activity"]).describe("관광지 / 식사 / 체험"),
  lat: z.number().describe("위도. 모르면 0"),
  lng: z.number().describe("경도. 모르면 0"),
  stayMinutes: z.number().describe("머무는 시간(분)"),
  entryFee: z.number().describe("1인 입장료·체험료(식사면 1인 식대), 요청 통화. 무료면 0"),
  parkingFee: z.number().describe("차량으로 갈 때 이 장소 주차비 (차 1대, 요청 차종), 요청 통화. 무료·모르면 0"),
  note: z.string().describe("운영 시간·휴무·예약 등 한 줄. 없으면 빈 문자열"),
});

const legSchema = z.object({
  mode: z.enum(LEG_MODES).describe("이 구간 이동 수단: vehicle(전용 차량) / transit(전철·버스·기차) / walk(도보)"),
  km: z.number().describe("이 구간 실제 이동 거리(km, 도로·노선 기준)"),
  minutes: z.number().describe("이 구간 이동 시간(분, 대중교통은 환승·대기 포함)"),
  route: z.string().describe("이용 도로나 노선 (예: 경춘고속도로, 경의중앙선 → 버스 33번, 도보). 모르면 빈 문자열"),
  transitFare: z.number().describe("대중교통이면 1인 요금 (요청 통화), 아니면 0"),
  toll: z.number().describe("차량이면 요청 차종 기준 통행료 (요청 통화, 차 1대), 없으면 0"),
});

export const dayTourResultSchema = z.object({
  title: z.string().describe("투어 상품명 (예: 가평 쁘띠프랑스·남이섬 당일 투어)"),
  summary: z.string().describe("투어 소개 1~2문장"),
  baseLat: z.number().describe("출발 기준지 위도. 모르면 0"),
  baseLng: z.number().describe("출발 기준지 경도. 모르면 0"),
  stops: z.array(stopSchema).describe("방문 순서대로 장소 (반일 2~4곳, 당일 3~6곳, 식사 포함)"),
  legs: z
    .array(legSchema)
    .describe("이동 구간. 첫 구간은 출발 기준지 → 첫 장소, 이어서 장소 → 다음 장소, 마지막은 마지막 장소 → 출발 기준지 복귀. 개수 = 장소 수 + 1"),
  deadheadKm: z.number().describe("차고지 → 출발 기준지 → (투어 끝) → 차고지로 차가 빈 채로 다니는 왕복 거리(km). 차고지가 없거나 모르면 0"),
  fuelPrice: z.number().describe("현지 경유(디젤) 1리터 가격, 요청 통화. 모르면 0"),
  fuelNote: z.string().describe("유가 기준 한 줄 (예: 오피넷 2026-10 전국 평균 경유). 없으면 빈 문자열"),
  transitBaseFare: z.number().describe("현지 대중교통 1회 기본요금 (요청 통화). 모르면 0"),
  driverDayRate: z.number().describe("관광 차량 기사 1일(약 10시간) 인건비 시세, 요청 통화. 모르면 0"),
  guideDayRate: z.number().describe("가이드 1일(약 8~10시간) 요금 시세, 요청 통화. 모르면 0"),
  guideHalfDayRate: z.number().describe("가이드 반일(약 4~5시간) 요금 시세, 요청 통화. 모르면 0"),
  charterDayRate: z.number().describe("요청 차종 기사 포함 1일 대절 요금 시세, 요청 통화. 모르면 0"),
  charterHalfDayRate: z.number().describe("요청 차종 기사 포함 반일 대절 요금 시세, 요청 통화. 모르면 0"),
  charterIncludes: z.string().describe("대절 요금에 포함되는 것 (예: 유류비·기사, 통행료·주차비 별도). 모르면 빈 문자열"),
  rateNote: z.string().describe("인건비·대절 요금 근거 한 줄. 없으면 빈 문자열"),
  market: z
    .array(
      z.object({
        name: z.string().describe("비슷한 판매 중 투어 상품명"),
        operator: z.string().describe("운영·판매 업체. 모르면 빈 문자열"),
        sourceName: z.string().describe("요금 확인 사이트 (Klook, 마이리얼트립 등). 모르면 빈 문자열"),
        priceLow: z.number().describe("1인 요금 하한 (요청 통화)"),
        priceHigh: z.number().describe("1인 요금 상한 (요청 통화)"),
        durationMinutes: z.number().describe("소요 시간(분). 모르면 0"),
        transport: z.string().describe("이동 방식 (전용 차량, 대중교통, 도보 등). 모르면 빈 문자열"),
        includes: z.string().describe("요금 포함 내역 한 줄. 모르면 빈 문자열"),
      }),
    )
    .describe("같은 지역 비슷한 판매 투어 (최대 6개, 검색으로 확인한 것만)"),
});
export type DayTourResult = z.infer<typeof dayTourResultSchema>;
export type DayTourStop = DayTourResult["stops"][number];
export type DayTourLegRaw = DayTourResult["legs"][number];

/** 화면에서 쓰는 구간 — 거리·시간을 어디서 얻었는지 함께 */
export interface DayTourLeg extends DayTourLegRaw {
  /** google: 구글 지도 경로 / searched: 웹 검색 조사 / estimated: 직선거리 어림·수단 변경 후 어림 */
  basis: "google" | "searched" | "estimated";
}

export interface DayTourResponse extends Omit<DayTourResult, "legs"> {
  legs: DayTourLeg[];
  searched: boolean;
  /** 구간 거리·시간에 구글 지도를 썼는지, 못 썼으면 이유 */
  routes: { source: "google" | "estimate"; note: string };
  sources: { title: string; url: string }[];
}
