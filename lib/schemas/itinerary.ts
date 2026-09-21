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
});

export type ItineraryRequest = z.infer<typeof itineraryRequestSchema>;

/** ---------- LLM 응답 (모델에게 보여주는 스키마이기도 하다) ---------- */

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
});

const dayPlanSchema = z.object({
  day: z.number().describe("1부터 시작하는 일차"),
  theme: z.string().describe("그날의 한 줄 주제"),
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
