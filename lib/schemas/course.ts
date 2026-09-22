import { z } from "zod";
import { ITEM_TYPES } from "@/lib/itemTypes";
import type { CourseMeta, DayPlan, ItineraryItem } from "@/types";

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const courseRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(20, "코스 내용을 20자 이상 붙여넣어 주세요.")
    .max(12000, "코스 내용이 너무 깁니다. (최대 12,000자)"),
  currency: z.enum(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]),
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
  entryFee: z
    .number()
    .describe(
      "1인 요금 추정 (요청 통화 단위): 입장료, 체험비, 마사지 요금, 크루즈 요금을 모두 여기에 넣는다. 마사지·체험·액티비티·크루즈·유료 명소는 유료이므로 0이면 안 되고 통상 요금을 추정한다. 무료 명소, 이동, 호텔, 자유시간, 식사, view_only/none이면 0. 식사가 포함된 체험(디너크루즈 등)은 전체 요금을 여기에",
    ),
  mealCost: z.number().describe("type이 meal일 때 1인 식대 추정 (요청 통화 단위). 그 외에는 0"),
  paidLocally: z
    .boolean()
    .describe(
      "원문이 이 항목의 요금을 '현지 지불', '현지 결제', '현장 결제', '현지 별도', '불포함'이라고 명시한 경우에만 true (고객이 현지에서 직접 내는 요금). 그런 말이 없으면 false",
    ),
  caution: z.string().describe("확인이 필요한 사항(예약 필수 등). 없으면 빈 문자열"),
});

export const courseResponseSchema = z.object({
  packageName: z.string().describe("상품명. 원문에 없으면 빈 문자열"),
  totalDays: z.number().describe("총 일수 (예: 4박 6일이면 6)"),
  nights: z.number().describe("숙박 수 (예: 4박 6일이면 4)"),
  cities: z.array(z.string()).describe("숙박/체류 도시를 방문 순서대로"),
  noShopping: z.boolean().describe("원문이 노쇼핑을 명시한 경우에만 true"),
  noOption: z.boolean().describe("원문이 노옵션을 명시한 경우에만 true"),
  hotelGrade: z.string().describe("원문에 적힌 호텔 등급/유형. 없으면 빈 문자열"),
  highlights: z.array(z.string()).describe("원문의 핵심 포인트 요약 목록. 없으면 빈 배열"),
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
    stayMinutes: Math.max(0, Math.round(raw.stayMinutes)),
    travelMinutesToNext: null,
    // 입장 개념이 없어도(마사지, 체험) 요금은 있을 수 있다. 외부 조망이나 요금이 없는 유형만 0으로 둔다.
    entryFee: raw.admission === "view_only" || NO_FEE_TYPES.has(raw.type) ? 0 : Math.max(0, raw.entryFee),
    mealCost: raw.type === "meal" ? Math.max(0, raw.mealCost) : 0,
    isEstimated: true,
    caution: raw.caution.trim() || undefined,
    ...(raw.paidLocally ? { payment: "local" as const } : {}),
  };
}

/** 검증된 LLM 응답을 앱 내부 타입으로 변환한다 (하루 전체를 순서대로 나열하는 linear 일정). */
export function toCoursePlan(parsed: ParsedCourse): {
  days: DayPlan[];
  meta: CourseMeta;
  nights: number;
  totalDays: number;
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
      items: day.items.map((item, i) => toItem(item, `d${dayNo}-i${i + 1}`)),
    };
  });

  // 도시 순서는 일차별 숙박 도시에서 직접 계산한다 (AI가 도착 도시를 앞에 두는 경우가 있다)
  const stayCities = [...new Set(days.map((d) => d.overnightCity ?? "").filter(Boolean))];
  const fallbackCities = parsed.cities.map((c) => c.trim()).filter(Boolean);

  return {
    days,
    nights: Math.max(0, Math.round(parsed.nights)),
    totalDays: days.length,
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
