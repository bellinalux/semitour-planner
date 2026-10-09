import { z } from "zod";
import { ITEM_TYPES } from "@/lib/itemTypes";
import { isSupportedCourseFile, MAX_COURSE_FILE_BYTES } from "@/lib/courseFile";
import { roundMinutes } from "@/lib/format";
import { enforceMealWindows } from "@/lib/mealTiming";
import type { CourseMeta, DayPlan, ItineraryItem } from "@/types";

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const courseRequestSchema = z
  .object({
    text: z.string().trim().max(12000, "코스 내용이 너무 깁니다. (최대 12,000자)").default(""),
    /** 업체가 사진·PDF·한글·엑셀·텍스트로 준 코스표. text 대신(또는 함께) 쓸 수 있다 */
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
  stayMinutes: z.number().describe("소요 시간(분). 원문에 있으면 그 값, 없으면 통상 소요 시간 추정. 모르면 0"),
  travelMinutesToNext: z
    .number()
    .describe(
      "다음 항목까지 이동 시간(분). 원문에 이동 수단·소요시간이 적혀 있으면 그 값, 없으면 실제 동선(도보/차량)을 고려한 현실적인 값으로 추정. 그날의 마지막 항목이면 0",
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
  found: z.boolean().describe("원문에 이 상품의 요금(견적 금액)이 적혀 있으면 true. 없으면 false이고 나머지는 0·빈 값"),
  currency: z.string().describe("요금 통화 코드 (KRW, USD, VND, THB, JPY, EUR, CNY 등). '원'은 KRW, '$'·'불'은 USD. 없으면 빈 문자열"),
  pricePerPerson: z.number().describe("성인 1인 요금 (원문 통화 그대로). 인원별 요금표만 있으면 원문이 기준으로 삼은 인원의 요금. 없으면 0"),
  basisTravelers: z.number().describe("몇 명 기준 요금인지 (예: 성인 4명 기준이면 4). 원문에 없으면 0"),
  roomBasis: z.enum(["twin", "single", "triple", "unknown"]).describe("객실 기준: 2인 1실이면 twin, 1인 1실이면 single, 3인 1실이면 triple, 원문에 없으면 unknown"),
  singleSupplement: z.number().describe("싱글차지(1인실 추가요금) 1인 금액 (원문 통화). 없으면 0"),
  tiers: z.array(z.object({ travelers: z.number(), pricePerPerson: z.number() })).describe("인원별 1인 요금표 (예: 2명 600, 4명 450). 없으면 빈 배열"),
  lines: z
    .array(z.object({ label: z.string(), amount: z.number(), unit: z.enum(LINE_UNITS) }))
    .describe("원문에 항목별로 나눠 적힌 금액(호텔·차량·가이드·입장료 등)과 단위. 나눠 적혀 있지 않으면 빈 배열"),
  includes: z.array(z.string()).describe("포함 사항 (원문 그대로 짧게). 없으면 빈 배열"),
  excludes: z.array(z.string()).describe("불포함 사항 (원문 그대로 짧게). 없으면 빈 배열"),
  shopping: z.string().describe("쇼핑 일정 표기 (예: 쇼핑 2회, 노쇼핑). 없으면 빈 문자열"),
  options: z.string().describe("선택관광 표기 (예: 선택관광 있음, 노옵션). 없으면 빈 문자열"),
  notes: z.string().describe("견적 조건·유효기간·시즌 할증 등 원문 메모. 없으면 빈 문자열"),
});

export type ParsedSupplierQuote = Omit<z.infer<typeof quoteSchema>, "found">;

export const courseResponseSchema = z.object({
  packageName: z.string().describe("상품명. 원문에 없으면 빈 문자열"),
  totalDays: z.number().describe("총 일수 (예: 4박 6일이면 6)"),
  nights: z.number().describe("숙박 수 (예: 4박 6일이면 4)"),
  cities: z.array(z.string()).describe("숙박/체류 도시를 방문 순서대로"),
  noShopping: z.boolean().describe("원문이 노쇼핑을 명시한 경우에만 true"),
  noOption: z.boolean().describe("원문이 노옵션을 명시한 경우에만 true"),
  hotelGrade: z.string().describe("원문에 적힌 호텔 등급/유형. 없으면 빈 문자열"),
  highlights: z.array(z.string()).describe("원문의 핵심 포인트 요약 목록. 없으면 빈 배열"),
  quote: quoteSchema.describe("원문(업체 견적서)에 적힌 요금. 코스만 있고 요금이 없으면 found=false"),
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

function toItem(raw: ParsedCourse["days"][number]["items"][number], id: string): ItineraryItem {
  return {
    id,
    type: raw.type as ItineraryItem["type"],
    admission: raw.admission,
    timeNote: raw.timeNote.trim() || undefined,
    name: raw.name.trim(),
    description: raw.description.trim(),
    stayMinutes: roundMinutes(raw.stayMinutes),
    travelMinutesToNext: roundMinutes(raw.travelMinutesToNext),
    // 입장 개념이 없어도(마사지, 체험) 요금은 있을 수 있다. 외부 조망이나 요금이 없는 유형만 0으로 둔다.
    entryFee: raw.admission === "view_only" || NO_FEE_TYPES.has(raw.type) ? 0 : Math.max(0, raw.entryFee),
    mealCost: raw.type === "meal" ? Math.max(0, raw.mealCost) : 0,
    isEstimated: true,
    caution: raw.caution.trim() || undefined,
    cuisine: raw.type === "meal" ? raw.cuisine.trim() || undefined : undefined,
    ...(raw.paidLocally ? { payment: "local" as const } : {}),
  };
}

/** 검증된 LLM 응답을 앱 내부 타입으로 변환한다 (하루 전체를 순서대로 나열하는 linear 일정). */
/** 견적 금액을 정리한다. 원문에 요금이 없으면 null */
export function toSupplierQuote(raw: ParsedCourse["quote"] | undefined): ParsedSupplierQuote | null {
  if (!raw || !raw.found) return null;
  const amount = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const tiers = raw.tiers.filter((t) => amount(t.travelers) > 0 && amount(t.pricePerPerson) > 0).map((t) => ({ travelers: Math.round(t.travelers), pricePerPerson: t.pricePerPerson }));
  const price = amount(raw.pricePerPerson) || tiers[0]?.pricePerPerson || 0;
  if (price <= 0) return null;
  const text = (s: string) => s.trim().slice(0, 300);
  const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).slice(0, 20).map((x) => x.slice(0, 120));
  return {
    currency: raw.currency.trim().toUpperCase().slice(0, 3),
    pricePerPerson: price,
    basisTravelers: Math.max(0, Math.round(raw.basisTravelers)),
    roomBasis: raw.roomBasis,
    singleSupplement: amount(raw.singleSupplement),
    tiers,
    lines: raw.lines.filter((l) => l.label.trim() && amount(l.amount) > 0).slice(0, 30).map((l) => ({ label: l.label.trim().slice(0, 80), amount: l.amount, unit: l.unit })),
    includes: list(raw.includes),
    excludes: list(raw.excludes),
    shopping: text(raw.shopping),
    options: text(raw.options),
    notes: text(raw.notes),
  };
}

export function toCoursePlan(parsed: ParsedCourse): {
  days: DayPlan[];
  meta: CourseMeta;
  nights: number;
  totalDays: number;
  quote: ParsedSupplierQuote | null;
} {
  const days: DayPlan[] = parsed.days.map((day, index) => {
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
    },
  };
}
