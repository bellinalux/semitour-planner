import { z } from "zod";
import { ITEM_TYPES } from "@/lib/itemTypes";
import { isSupportedCourseFile, MAX_COURSE_FILE_BYTES } from "@/lib/courseFile";
import { roundMinutes } from "@/lib/format";
import { applyFlightWithMeals, looksLikeFlightItem } from "@/lib/flightApply";
import { clampMealStay, enforceMealWindows } from "@/lib/mealTiming";
import type { CourseMeta, DayPlan, FlightOption, ItineraryItem } from "@/types";

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const courseRequestSchema = z
  .object({
    text: z.string().trim().max(12000, "코스 내용이 너무 깁니다. (최대 12,000자)").default(""),
    /** 업체가 사진·PDF·한글·워드·엑셀·텍스트로 준 코스표. text 대신(또는 함께) 쓸 수 있다 */
    file: z
      .object({
        name: z.string().trim().min(1).max(200).refine(isSupportedCourseFile, {
          message: "지원하지 않는 파일 형식입니다.",
        }),
        /** 브라우저가 보내는 MIME. 형식 판별에는 name의 확장자를 쓰므로 참고용이다 */
        mimeType: z.string().max(200),
        /** base64로 인코딩한 파일 내용 */
        data: z.string().min(1).max(Math.ceil((MAX_COURSE_FILE_BYTES * 4) / 3) + 1000, "파일이 너무 큽니다. (최대 6MB)"),
      })
      .optional(),
    currency: z.enum(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]),
  })
  .refine((v) => v.text.trim().length >= 20 || v.file, {
    message: "코스 내용을 20자 이상 붙여넣거나, 파일을 첨부해 주세요.",
    path: ["text"],
  });

export type CourseRequest = z.infer<typeof courseRequestSchema>;

/** ---------- LLM 응답 (모델에게 보여주는 스키마이기도 하다) ---------- */

const itemSchema = z.object({
  type: z.enum(ITEM_TYPES as [string, ...string[]]).describe("항목 유형"),
  name: z.string().describe("원문에 적힌 장소/활동 이름"),
  description: z.string().describe("원문에 있는 설명. 없으면 빈 문자열"),
  timeNote: z.string().describe("원문에 적힌 소요 시간 표기(예: 약 30~40분). 없으면 빈 문자열"),
  admission: z
    .enum(["enter", "view_only", "none", "unknown"])
    .describe(
      "입장 여부. 원문이 입장하지 않고 조망/외관만이라고 명시할 때만 view_only. 입장 개념이 없으면 none, 불확실하면 unknown",
    ),
  stayMinutes: z
    .number()
    .describe(
      "그 장소에서 실제로 머무는 시간(분). 원문에 있으면 그 값. 없으면 추정하되, 한 구역을 걸어서 도는 장소들은 구역 전체 시간을 나눈 정도로 짧게. 식사 50~90, 카페 20~40. 모르면 0",
    ),
  travelMinutesToNext: z
    .number()
    .describe(
      "다음 항목까지 이동 시간(분). 원문에 있으면 그 값. 없으면 실제 거리로: 같은 구역 도보 3~10분, 다른 구역 차량 15~40분. 모든 이동을 똑같이 채우지 않는다. 그날의 마지막 항목이면 0",
    ),
  entryFee: z
    .number()
    .describe(
      "1인 요금 추정 (요청 통화 단위): 입장료, 체험비, 마사지 요금, 크루즈 요금을 모두 여기에 넣는다. 마사지·체험·액티비티·크루즈·유료 명소는 유료이므로 0이면 안 되고 통상 요금을 추정한다. 무료 명소, 이동, 호텔, 자유시간, 식사, view_only/none이면 0. 식사가 포함된 체험(디너크루즈 등)은 전체 요금을 여기에",
    ),
  mealCost: z.number().describe("type이 meal일 때 1인 식대 추정 (요청 통화 단위). 그 외에는 0"),
  cuisine: z.string().describe("type이 meal이면 원문에 적힌(또는 이름으로 짐작되는) 음식 종류를 짧게(예: 현지식, 한식, 중식, 바베큐, 씨푸드, 뷔페). 그 외에는 빈 문자열"),
  paidLocally: z
    .boolean()
    .describe(
      "원문이 이 항목의 요금을 '현지 지불', '현지 결제', '현장 결제', '현지 별도', '불포함'이라고 명시한 경우에만 true (고객이 현지에서 직접 내는 요금). 그런 말이 없으면 false",
    ),
  caution: z.string().describe("확인이 필요한 사항(예약 필수 등). 없으면 빈 문자열"),
});

const LINE_UNITS = ["per_person", "per_group", "per_day", "per_room_night", "unknown"] as const;

/** 업체 견적서의 금액 — 원문에 적힌 것만 옮긴다 (금액을 지어내지 않는다) */
const quoteSchema = z.object({
  found: z.boolean().describe("원문에 이 상품의 요금이나 견적 조건(인원·객실 기준, 포함·불포함, 호텔)이 하나라도 있으면 true. 아무것도 없으면 false"),
  currency: z.string().describe("요금 통화 코드 (KRW, USD, VND, THB, JPY, EUR, CNY 등). '원'은 KRW, '$'·'불'은 USD. 없으면 빈 문자열"),
  pricePerPerson: z
    .number()
    .describe(
      "이 패키지 상품 자체의 성인 1인 요금 (원문 통화 그대로). 인원별 요금표만 있으면 원문이 기준으로 삼은 인원의 요금. 불포함·선택관광·옵션·추가 데이투어·싱글차지·팁·가이드 경비 금액은 절대 넣지 않는다. 상품 요금이 없으면 0",
    ),
  basisTravelers: z.number().describe("몇 명 기준 요금인지 (예: 성인 4명 기준이면 4). 원문에 없으면 0"),
  minTravelers: z.number().describe("최소 출발 인원 (예: 최소 성인 4인 이상이면 4). 원문에 없으면 0"),
  hotels: z.string().describe("원문에 적힌 호텔 이름·등급 표기 그대로 (후보가 여럿이면 모두, 예: 골든드래곤(4성), 리젠시 아트(5성) 중 하나). 없으면 빈 문자열"),
  roomBasis: z.enum(["twin", "single", "triple", "unknown"]).describe("객실 기준: 2인 1실이면 twin, 1인 1실이면 single, 3인 1실이면 triple, 원문에 없으면 unknown"),
  singleSupplement: z.number().describe("싱글차지(1인실 추가요금) 1인 금액 (원문 통화). 없으면 0"),
  tiers: z.array(z.object({ travelers: z.number(), pricePerPerson: z.number() })).describe("인원별 1인 요금표 (예: 2명 600, 4명 450). 없으면 빈 배열"),
  datePrices: z
    .array(
      z.object({
        nights: z.number().describe("몇 박 상품의 요금인지 (예: 3박 4일이면 3). 원문에 없으면 0"),
        weekdays: z.string().describe("출발 요일·기간 표기 원문 그대로 (예: 일, 월, 화 / 목, 금 / 토). 없으면 빈 문자열"),
        pricePerPerson: z.number().describe("그 출발 요일(기간)의 성인 1인 요금 (원문 통화)"),
      }),
    )
    .describe("출발 요일·기간·박수별 1인 요금표 (예: 3박 4일 일·월·화 4780, 수 4880). 표의 모든 칸을 옮긴다. 없으면 빈 배열"),
  hotelNames: z.array(z.string()).describe("원문에 적힌 호텔 이름만 하나씩 (등급 표기·'중 하나' 같은 말은 빼고, 예: 골든드래곤 호텔). 없으면 빈 배열"),
  optionPrices: z
    .array(
      z.object({
        name: z.string().describe("불포함·선택관광 이름 (예: 홍콩 데이투어)"),
        amount: z.number().describe("원문에 적힌 금액"),
        currency: z.string().describe("그 금액의 통화 코드 (상품 요금과 다를 수 있다, 예: USD). 모르면 빈 문자열"),
        perGroup: z.boolean().describe("단체 전체 금액이면 true, 1인 금액이면 false"),
        minTravelers: z.number().describe("그 옵션의 최소 인원 (예: 최소 8인). 없으면 0"),
      }),
    )
    .describe("불포함 사항·선택관광 중 금액이 적힌 것. 상품 요금은 넣지 않는다. 없으면 빈 배열"),
  lines: z
    .array(z.object({ label: z.string(), amount: z.number(), unit: z.enum(LINE_UNITS) }))
    .describe("원문에 항목별로 나눠 적힌 금액(호텔·차량·가이드·입장료 등)과 단위. 나눠 적혀 있지 않으면 빈 배열"),
  includes: z.array(z.string()).describe("포함 사항 (원문 그대로 짧게). 없으면 빈 배열"),
  excludes: z.array(z.string()).describe("불포함 사항 (원문 그대로 짧게). 없으면 빈 배열"),
  shopping: z.string().describe("쇼핑 일정 표기 (예: 쇼핑 2회, 노쇼핑). 없으면 빈 문자열"),
  options: z.string().describe("선택관광 표기 (예: 선택관광 있음, 노옵션). 없으면 빈 문자열"),
  notes: z.string().describe("견적 조건·유효기간·시즌 할증 등 원문 메모. 없으면 빈 문자열"),
});

/** 원문에 적힌 항공편 한 편 — 시각은 각 공항의 현지 시각 그대로 */
const flightLegSchema = z.object({
  airline: z.string().describe("항공사 (예: 제주항공). 없으면 빈 문자열"),
  flightNumber: z.string().describe("편명 (예: 7C2401). 없으면 빈 문자열"),
  departAirport: z.string().describe("출발 공항·도시 (예: 인천). 없으면 빈 문자열"),
  departTime: z.string().describe("출발 시각 HH:mm (원문 그대로, 현지 시각). 없으면 빈 문자열"),
  arriveAirport: z.string().describe("도착 공항·도시 (예: 마카오). 없으면 빈 문자열"),
  arriveTime: z.string().describe("도착 시각 HH:mm (원문 그대로, 현지 시각, 다음날이면 +1 표기). 없으면 빈 문자열"),
});

export type ParsedFlightLeg = z.infer<typeof flightLegSchema>;

export type ParsedSupplierQuote = Omit<z.infer<typeof quoteSchema>, "found" | "datePrices"> & {
  /** 상품 요금이 아니라고 보고 뺀 금액 (원문 통화, 없으면 0) */
  suspectPrice: number;
  /** 출발 요일별 1인 요금 — weekdays는 0(일)~6(토), 비어 있으면 요일 구분 없음 */
  datePrices: { nights: number; weekdays: number[]; label: string; pricePerPerson: number }[];
};

const WEEKDAY = "일월화수목금토";
/** "일, 월, 화" · "목~토" · "주말" 같은 요일 표기를 0(일)~6(토) 목록으로 */
export function parseWeekdays(text: string): number[] {
  const out = new Set<number>();
  if (/주말/.test(text)) [0, 6].forEach((d) => out.add(d));
  if (/평일/.test(text)) [1, 2, 3, 4, 5].forEach((d) => out.add(d));
  // "평일"·"주말"·"요일"의 '일'을 일요일로 읽지 않도록 지운다
  const t = text.replace(/요일|평일|주말/g, "");
  for (const m of t.matchAll(/([일월화수목금토])\s*[~\-–]\s*([일월화수목금토])/g)) {
    const a = WEEKDAY.indexOf(m[1]);
    const b = WEEKDAY.indexOf(m[2]);
    for (let d = a; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === b) break;
    }
  }
  for (const ch of t) if (WEEKDAY.includes(ch)) out.add(WEEKDAY.indexOf(ch));
  return [...out].sort((a, b) => a - b);
}

export const courseResponseSchema = z.object({
  packageName: z.string().describe("상품명. 원문에 없으면 빈 문자열"),
  totalDays: z.number().describe("총 일수 (예: 4박 6일이면 6)"),
  nights: z.number().describe("숙박 수 (예: 4박 6일이면 4)"),
  cities: z.array(z.string()).describe("숙박/체류 도시를 방문 순서대로"),
  noShopping: z.boolean().describe("원문이 노쇼핑을 명시한 경우에만 true"),
  noOption: z.boolean().describe("원문이 노옵션을 명시한 경우에만 true"),
  hotelGrade: z.string().describe("원문에 적힌 호텔 등급/유형. 없으면 빈 문자열"),
  highlights: z.array(z.string()).describe("원문의 핵심 포인트 요약 목록. 없으면 빈 배열"),
  quote: quoteSchema.describe("원문(업체 견적서·코스표)에 적힌 요금과 견적 조건. 아무것도 없으면 found=false"),
  flights: z
    .object({ outbound: flightLegSchema.describe("가는 편 (첫날)"), inbound: flightLegSchema.describe("오는 편 (마지막 날)") })
    .describe("원문에 적힌 항공편. 원문에 없는 값은 빈 문자열 (지어내지 않는다)"),
  days: z.array(
    z.object({
      day: z.number(),
      overnightCity: z.string().describe("그날 밤 숙박하는 도시. 숙박이 없으면(기내, 귀국일) 빈 문자열"),
      title: z.string().describe("그날의 한 줄 요약"),
      items: z.array(itemSchema).describe("그날의 항목을 원문 순서대로"),
    }),
  ),
});

type ParsedCourse = z.infer<typeof courseResponseSchema>;

/** 입장/체험 요금이 붙지 않는 항목 유형 */
const NO_FEE_TYPES = new Set(["flight", "transfer", "hotel", "free_time", "meal"]);

/** "마카오 공항 도착", "인천 국제공항 출발"처럼 공항 출발·도착인데 관광 등으로 분류된 항목은 항공으로 바로잡는다 */
function itemType(raw: { type: string; name: string }): ItineraryItem["type"] {
  const airport = /공항|airport/i.test(raw.name) && /도착|출발|arriv|depart/i.test(raw.name);
  if (airport && !["flight", "transfer", "hotel", "meal"].includes(raw.type)) return "flight";
  return raw.type as ItineraryItem["type"];
}

function toItem(raw: ParsedCourse["days"][number]["items"][number], id: string): ItineraryItem {
  return {
    id,
    type: itemType(raw),
    admission: raw.admission,
    timeNote: raw.timeNote.trim() || undefined,
    name: raw.name.trim(),
    description: raw.description.trim(),
    stayMinutes: clampMealStay(raw.type, `${raw.name} ${raw.description}`, roundMinutes(raw.stayMinutes)),
    travelMinutesToNext: roundMinutes(raw.travelMinutesToNext),
    // 입장 개념이 없어도(마사지, 체험) 요금은 있을 수 있다. 외부 조망이나 요금이 없는 유형만 0으로 둔다.
    entryFee: raw.admission === "view_only" || NO_FEE_TYPES.has(itemType(raw) ?? "") ? 0 : Math.max(0, raw.entryFee),
    mealCost: raw.type === "meal" ? Math.max(0, raw.mealCost) : 0,
    isEstimated: true,
    caution: raw.caution.trim() || undefined,
    cuisine: raw.type === "meal" ? raw.cuisine.trim() || undefined : undefined,
    ...(raw.paidLocally ? { payment: "local" as const } : {}),
  };
}

/**
 * 견적서 내용을 정리한다. 요금이 없어도 인원·객실 기준, 포함·불포함, 호텔이 있으면 남긴다 (검증표·질문에 쓴다).
 * 읽은 1인 요금이 불포함·옵션 문구에 적힌 금액과 같으면(예: 불포함 "홍콩 데이투어 인당 180USD") 상품 요금이 아니라고 보고 뺀다.
 * 아무 내용도 없으면 null.
 */
export function toSupplierQuote(raw: ParsedCourse["quote"] | undefined): ParsedSupplierQuote | null {
  if (!raw || !raw.found) return null;
  const amount = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const tiers = raw.tiers.filter((t) => amount(t.travelers) > 0 && amount(t.pricePerPerson) > 0).map((t) => ({ travelers: Math.round(t.travelers), pricePerPerson: t.pricePerPerson }));
  const text = (s: string) => s.trim().slice(0, 300);
  const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).slice(0, 20).map((x) => x.slice(0, 120));
  const includes = list(raw.includes);
  const excludes = list(raw.excludes);
  let price = amount(raw.pricePerPerson) || tiers[0]?.pricePerPerson || 0;
  let suspectPrice = 0;
  if (price > 0) {
    const digits = String(price);
    // 숫자 앞뒤가 다른 숫자면(예: 180 ⊂ 1800) 같은 금액으로 보지 않는다
    const same = new RegExp(`(^|[^0-9])${digits.replace(".", "\\.")}([^0-9]|$)`);
    if ([...excludes, raw.options].some((s) => same.test(s.replace(/[,\s]/g, "")))) {
      suspectPrice = price;
      price = 0;
    }
  }
  const datePrices = raw.datePrices
    .filter((d) => amount(d.pricePerPerson) > 0)
    .slice(0, 24)
    .map((d) => ({ nights: Math.max(0, Math.round(d.nights)), weekdays: parseWeekdays(d.weekdays), label: d.weekdays.trim().slice(0, 40), pricePerPerson: d.pricePerPerson }));
  // 요일별 요금만 있고 대표 요금이 없으면(또는 옵션 금액과 겹쳐 뺐으면) 가장 낮은 요일 요금을 대표로 둔다
  if (price === 0 && datePrices.length > 0) price = Math.min(...datePrices.map((d) => d.pricePerPerson));
  const hotelNames = raw.hotelNames.map((h) => h.trim().slice(0, 80)).filter(Boolean).slice(0, 8);
  const optionPrices = raw.optionPrices
    .filter((o) => o.name.trim() && amount(o.amount) > 0)
    .slice(0, 10)
    .map((o) => ({
      name: o.name.trim().slice(0, 80),
      amount: o.amount,
      currency: (o.currency.trim().toUpperCase() || raw.currency.trim().toUpperCase()).slice(0, 3),
      perGroup: o.perGroup,
      minTravelers: Math.max(0, Math.round(o.minTravelers)),
    }));
  const hasInfo = price > 0 || includes.length > 0 || excludes.length > 0 || raw.basisTravelers > 0 || raw.minTravelers > 0 || raw.roomBasis !== "unknown" || raw.hotels.trim() !== "";
  if (!hasInfo) return null;
  return {
    currency: raw.currency.trim().toUpperCase().slice(0, 3),
    pricePerPerson: price,
    suspectPrice,
    basisTravelers: Math.max(0, Math.round(raw.basisTravelers)),
    minTravelers: Math.max(0, Math.round(raw.minTravelers)),
    hotels: text(raw.hotels),
    roomBasis: raw.roomBasis,
    singleSupplement: amount(raw.singleSupplement),
    tiers,
    datePrices,
    hotelNames,
    optionPrices,
    lines: raw.lines.filter((l) => l.label.trim() && amount(l.amount) > 0).slice(0, 30).map((l) => ({ label: l.label.trim().slice(0, 80), amount: l.amount, unit: l.unit })),
    includes,
    excludes,
    shopping: text(raw.shopping),
    options: text(raw.options),
    notes: text(raw.notes),
  };
}

const HHMM = /(\d{1,2}):(\d{2})/;

/**
 * 원문에 적힌 항공편을 일정에 반영할 항공편으로 — 출발 시각을 모르면 반영하지 않는다.
 * 경유·소요시간은 원문에 없으면 모르는 값으로 둔다(stops = -1).
 */
/** 비행 항목 글에서 "09:50 ~ 12:50" 같은 출발~도착 시각 범위 */
const TIME_RANGE = /(\d{1,2}:\d{2})\s*(?:~|〜|∼|-|–|—|→)\s*(\d{1,2}:\d{2})/;

/** 그날 비행 항목(이름·설명)에 적힌 출발~도착 시각. 없으면 null */
export function flightTimesInDay(day: DayPlan | undefined): { depart: string; arrive: string } | null {
  if (!day) return null;
  for (const item of day.items) {
    if (!looksLikeFlightItem(item)) continue;
    const m = TIME_RANGE.exec(`${item.name} ${item.description}`);
    if (m) return { depart: m[1].padStart(5, "0"), arrive: m[2].padStart(5, "0") };
  }
  return null;
}

/**
 * 원문 항공편을 일정에 반영할 항공편으로. AI가 항공편 칸을 비웠어도 첫날·마지막 날 비행 항목 글에
 * "제주항공 (09:50 ~ 12:50)"처럼 시각이 적혀 있으면 그 시각을 쓴다(출발·도착 모두 원문 시각 — 검증되지 않은 추정은 쓰지 않는다).
 */
export function courseFlightOption(raw: ParsedCourse["flights"] | undefined, days: DayPlan[] = []): FlightOption | null {
  const empty = { airline: "", flightNumber: "", departAirport: "", departTime: "", arriveAirport: "", arriveTime: "" };
  const f = raw ?? { outbound: empty, inbound: empty };
  const fill = (leg: typeof empty, found: { depart: string; arrive: string } | null) =>
    found && (!HHMM.test(leg.departTime) || !HHMM.test(leg.arriveTime))
      ? { ...leg, departTime: HHMM.test(leg.departTime) ? leg.departTime : found.depart, arriveTime: HHMM.test(leg.arriveTime) ? leg.arriveTime : found.arrive }
      : leg;
  const out = fill(f.outbound, flightTimesInDay(days[0]));
  const back = days.length > 1 ? fill(f.inbound, flightTimesInDay(days[days.length - 1])) : f.inbound;
  if (!HHMM.test(out.departTime) && !HHMM.test(back.departTime)) return null;
  const t = (s: string) => s.trim();
  return {
    airline: t(out.airline) || t(back.airline),
    flightNumber: t(out.flightNumber),
    departDate: "",
    departAirport: t(out.departAirport),
    departTime: t(out.departTime),
    arriveAirport: t(out.arriveAirport),
    arriveTime: t(out.arriveTime),
    stops: -1,
    duration: "",
    price: 0,
    basis: "estimated",
    sourceName: "업체 코스표",
    link: "",
    returnFlightNumber: t(back.flightNumber),
    returnDepartDate: "",
    returnDepartAirport: t(back.departAirport),
    returnDepartTime: t(back.departTime),
    returnArriveAirport: t(back.arriveAirport),
    returnArriveTime: t(back.arriveTime),
    returnStops: -1,
    returnDuration: "",
  };
}

export function toCoursePlan(parsed: ParsedCourse): {
  days: DayPlan[];
  meta: CourseMeta;
  nights: number;
  totalDays: number;
  quote: ParsedSupplierQuote | null;
} {
  const rawDays: DayPlan[] = parsed.days.map((day, index) => {
    const dayNo = index + 1;
    return {
      day: dayNo,
      theme: day.title.trim(),
      kind: "linear",
      overnightCity: day.overnightCity.trim(),
      amGuided: [],
      pmFreeOptions: [],
      items: enforceMealWindows(day.items.map((item, i) => toItem(item, `d${dayNo}-i${i + 1}`))),
    };
  });

  // 원문에 항공편 시각이 있으면: 비행 항목의 이동 시간 = 출발→도착(현지 시각 차이), 그날 일정은 출발 시각에 맞춰 시작
  const flight = courseFlightOption(parsed.flights, rawDays);
  const days = flight ? applyFlightWithMeals(rawDays, flight) : rawDays;

  // 도시 순서는 일차별 숙박 도시에서 직접 계산한다 (AI가 도착 도시를 앞에 두는 경우가 있다)
  const stayCities = [...new Set(days.map((d) => d.overnightCity ?? "").filter(Boolean))];
  const fallbackCities = parsed.cities.map((c) => c.trim()).filter(Boolean);

  return {
    days,
    nights: Math.max(0, Math.round(parsed.nights)),
    totalDays: days.length,
    quote: toSupplierQuote(parsed.quote),
    meta: {
      packageName: parsed.packageName.trim(),
      cities: stayCities.length > 0 ? stayCities : fallbackCities,
      noShopping: parsed.noShopping,
      noOption: parsed.noOption,
      hotelGrade: parsed.hotelGrade.trim(),
      highlights: parsed.highlights.map((h) => h.trim()).filter(Boolean),
      flight,
    },
  };
}
