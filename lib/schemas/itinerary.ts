import { z } from "zod";
import type { DayPlan, ItineraryItem } from "@/types";

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const itineraryRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  days: z.number().int().min(1).max(14),
  travelers: z.number().int().min(1).max(50),
  currency: z.enum(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]),
  themes: z.array(z.enum(["history", "food", "nature", "shopping", "photo", "activity", "local"])).max(7),
  notes: z.string().max(500),
  travelType: z.enum(["semi", "package", "honeymoon", "senior", "accessible"]).default("semi"),
  /** 사용자가 직접 지정한 도시 순서·일수 (예: "로마 2일, 피렌체 2일, 베니스 2일"). 비우면 AI가 알아서 도시를 구성한다 */
  regionPlan: z.string().max(300).default(""),
});

export type ItineraryRequest = z.infer<typeof itineraryRequestSchema>;

/** ---------- LLM 응답 (모델에게 보여주는 스키마이기도 하다) ---------- */

const accessibilitySchema = z.object({
  level: z.enum(["ok", "limited", "difficult", "unknown"]).describe("휠체어·거동불편 여행자의 이용 가능 정도"),
  wheelchairAccessible: z.boolean().describe("휠체어로 이용 가능한지"),
  accessibleRestroom: z.boolean().describe("장애인 화장실이 있는지"),
  elevator: z.boolean().describe("엘리베이터가 있는지"),
  ramp: z.boolean().describe("경사로(램프)가 있는지"),
  note: z.string().describe("조사 근거·유의사항 한 줄. 확인 못했으면 빈 문자열"),
  mustSeeButHard: z
    .boolean()
    .describe("대표 명소라 대체하기 어렵지만 위 시설 문제로 휠체어·거동불편 여행자의 이용이 사실상 어려운 곳이면 true"),
});

const itemSchema = z.object({
  name: z.string().describe("명소/식당 이름 (현지에서 검색 가능한 실제 이름)"),
  description: z.string().describe("이 장소에서 하는 활동과 볼거리 1~2문장"),
  stayMinutes: z.number().describe("예상 체류 시간(분)"),
  travelMinutesToNext: z
    .number()
    .describe("다음 장소까지 이동 시간(분). 해당 목록의 마지막 장소는 0"),
  entryFee: z.number().describe("1인 입장료 (견적 통화 단위, 무료면 0)"),
  mealCost: z.number().describe("1인 식대 (견적 통화 단위, 식사 장소가 아니면 0)"),
  caution: z.string().describe("휴관일·예약 필요 등 확인이 필요한 사항. 없으면 빈 문자열"),
  cuisine: z.string().describe("식사(식당) 항목이면 음식 종류를 짧게 씁니다 (예: 현지식, 한식, 중식, 바베큐, 씨푸드, 뷔페). 식사 항목이 아니면 빈 문자열"),
  accessibility: accessibilitySchema
    .optional()
    .describe("여행 유형이 accessible(장애인투어)일 때만 채웁니다. 그 외 유형이면 생략합니다."),
});

const dayPlanSchema = z.object({
  day: z.number().describe("1부터 시작하는 일차"),
  theme: z.string().describe("그날의 한 줄 주제"),
  overnightCity: z
    .string()
    .describe(
      "그날 밤 숙박하는 도시 이름. 여러 도시를 도는 여행이면 도시가 바뀌는 날을 정확히 반영합니다(예: 로마 2일 다음 피렌체로 이동하면 그날부터 '피렌체'). 단일 도시 여행이면 매일 그 도시 이름을 씁니다.",
    ),
  amGuided: z.array(itemSchema).min(2).max(4).describe("오전 가이드 투어 일정. 명소 2~3곳 + 마지막에 점심 식당 1곳"),
  pmFreeOptions: z
    .array(
      z.object({
        id: z.enum(["A", "B"]),
        title: z.string().describe("옵션 콘셉트 한 줄 (예: 골목 산책과 카페 코스)"),
        items: z.array(itemSchema).min(2).max(3).describe("오후 코스의 장소 2~3곳"),
      }),
    )
    .length(2)
    .describe("오후 반자유 일정: 고객이 하나를 고르는 추천 코스. 정확히 2개(id는 A, B)"),
});

export const itineraryResponseSchema = z.object({
  days: z.array(dayPlanSchema).min(1).max(14).describe("요청한 여행 일수와 정확히 같은 개수"),
});

type RawItem = z.infer<typeof itemSchema>;

function toItem(raw: RawItem, id: string, isLast: boolean): ItineraryItem {
  return {
    id,
    name: raw.name.trim(),
    description: raw.description.trim(),
    stayMinutes: Math.max(0, Math.round(raw.stayMinutes)),
    travelMinutesToNext: isLast ? null : Math.max(0, Math.round(raw.travelMinutesToNext)),
    entryFee: Math.max(0, raw.entryFee),
    mealCost: Math.max(0, raw.mealCost),
    isEstimated: true,
    caution: raw.caution.trim() || undefined,
    cuisine: raw.cuisine.trim() || undefined,
    accessibility: raw.accessibility ? { ...raw.accessibility, note: raw.accessibility.note.trim() } : undefined,
  };
}

/** 검증된 LLM 응답을 앱 내부 타입(DayPlan[])으로 변환한다. id 부여, 마지막 장소 이동시간 null 처리. */
export function toDayPlans(
  parsed: z.infer<typeof itineraryResponseSchema>,
  expectedDays: number,
): DayPlan[] {
  return parsed.days
    .slice(0, expectedDays)
    .map((day, index) => {
      const dayNo = index + 1;
      return {
        day: dayNo,
        theme: day.theme.trim(),
        overnightCity: day.overnightCity.trim() || undefined,
        kind: "semi" as const,
        items: [],
        amGuided: day.amGuided.map((item, i) =>
          toItem(item, `d${dayNo}-am-${i + 1}`, i === day.amGuided.length - 1),
        ),
        pmFreeOptions: day.pmFreeOptions.map((option) => ({
          id: option.id,
          title: option.title.trim(),
          items: option.items.map((item, i) =>
            toItem(item, `d${dayNo}-pm${option.id}-${i + 1}`, i === option.items.length - 1),
          ),
        })),
      };
    });
}
