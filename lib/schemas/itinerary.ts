import { z } from "zod";
import { roundMinutes } from "@/lib/format";
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
  /** 국내(한국을 방문하는 외국인 대상)/해외 여행. 대상 관광객이 누구인지에 따라 조사·추천 범위가 달라진다 */
  tripScope: z.enum(["domestic", "overseas"]).default("overseas"),
  /** 사용자가 직접 지정한 도시 순서·일수 (예: "로마 2일, 피렌체 2일, 베니스 2일"). 비우면 AI가 알아서 도시를 구성한다 */
  regionPlan: z.string().max(300).default(""),
  /** 판매가·도매가에서 시작한 견적의 예산 안내 (1인 입장·체험 합계, 식사 1끼 수준). 비우면 예산 제한 없음 */
  budgetNote: z.string().trim().max(300).default(""),
  /** 일정 강도 — 쉬는 날·늦은 출발을 얼마나 넣을지 */
  pace: z.enum(["relaxed", "normal", "packed"]).default("normal"),
  companions: z.array(z.enum(["senior", "kids", "infant", "couple", "friends", "group"])).max(6).default([]),
  mustHave: z.string().max(300).default(""),
  avoid: z.string().max(300).default(""),
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

export const DAY_STYLES = ["semi", "full", "late", "pmfree", "free"] as const;

const dayPlanSchema = z.object({
  day: z.number().describe("1부터 시작하는 일차"),
  theme: z.string().describe("그날의 한 줄 주제"),
  style: z
    .enum(DAY_STYLES)
    .describe(
      "그날 구성. semi: 오전 가이드(amGuided)+오후 반자유 A/B(pmFreeOptions) / full: 하루 전체 가이드 관광(fullDay) / late: 오전 자유(늦잠·호텔 휴식)+오후 관광(fullDay, 13:00 출발) / pmfree: 오전 관광+점심 뒤 오후 자유(fullDay) / free: 전일 자유(freeNote에 추천 활동)",
    ),
  overnightCity: z
    .string()
    .describe(
      "그날 밤 숙박하는 도시 이름. 여러 도시를 도는 여행이면 도시가 바뀌는 날을 정확히 반영합니다(예: 로마 2일 다음 피렌체로 이동하면 그날부터 '피렌체'). 단일 도시 여행이면 매일 그 도시 이름을 씁니다.",
    ),
  amGuided: z.array(itemSchema).max(4).describe("style이 semi일 때만: 오전 가이드 투어 일정. 명소 2~3곳 + 마지막에 점심 식당 1곳. 다른 style이면 빈 배열"),
  pmFreeOptions: z
    .array(
      z.object({
        id: z.enum(["A", "B"]),
        title: z.string().describe("옵션 콘셉트 한 줄 (예: 골목 산책과 카페 코스)"),
        items: z.array(itemSchema).min(2).max(3).describe("오후 코스의 장소 2~3곳"),
      }),
    )
    .max(2)
    .describe("style이 semi일 때만: 오후 반자유 일정, 고객이 하나를 고르는 추천 코스 정확히 2개(id는 A, B). 다른 style이면 빈 배열"),
  fullDay: z
    .array(itemSchema)
    .max(8)
    .describe("style이 full·late·pmfree일 때: 방문 순서대로 장소·식사 (full은 4~7곳, late는 오후 2~4곳, pmfree는 오전 2~3곳+점심). 다른 style이면 빈 배열"),
  freeNote: z.string().describe("style이 free일 때: 자유일에 고객이 할 만한 활동·선택관광 추천 2~3가지 (한두 문장). 아니면 빈 문자열"),
});

export const itineraryResponseSchema = z.object({
  days: z.array(dayPlanSchema).min(1).max(14).describe("요청한 여행 일수와 정확히 같은 개수"),
});

type RawItem = z.infer<typeof itemSchema>;

function toItem(raw: RawItem, id: string, isLast: boolean): ItineraryItem {
  return {
    id,
    // 음식 종류를 적은 항목은 식당 — 유형을 식사로 둔다(코스 엔진의 점심 판단·식대 입력칸·문서의 조중석 표기)
    ...(raw.cuisine.trim() ? { type: "meal" as const } : {}),
    name: raw.name.trim(),
    description: raw.description.trim(),
    stayMinutes: roundMinutes(raw.stayMinutes),
    travelMinutesToNext: isLast ? null : roundMinutes(raw.travelMinutesToNext),
    entryFee: Math.max(0, raw.entryFee),
    mealCost: Math.max(0, raw.mealCost),
    isEstimated: true,
    caution: raw.caution.trim() || undefined,
    cuisine: raw.cuisine.trim() || undefined,
    accessibility: raw.accessibility ? { ...raw.accessibility, note: raw.accessibility.note.trim() } : undefined,
  };
}

/** 쉬는 날 항목 (자유시간) */
function freeItem(id: string, name: string, minutes: number, description: string): ItineraryItem {
  return { id, type: "free_time", admission: "none", name, description, stayMinutes: minutes, travelMinutesToNext: 0, entryFee: 0, mealCost: 0, isEstimated: false };
}

/** 하루 전체를 순서대로 둔 날 (full·late·pmfree·free) */
function linearDay(base: Pick<DayPlan, "day" | "theme" | "overnightCity">, items: ItineraryItem[], extra: Partial<DayPlan> = {}): DayPlan {
  return { ...base, kind: "linear", items, amGuided: [], pmFreeOptions: [], ...extra };
}

/**
 * 검증된 LLM 응답을 앱 내부 타입(DayPlan[])으로 변환한다. id 부여, 마지막 장소 이동시간 null 처리.
 * 날 구성(style): semi는 오전 가이드+오후 A/B, 나머지는 하루를 순서대로 둔 날(linear)로 —
 * late는 13:00 출발(오전 자유), pmfree는 점심 뒤 오후 자유시간, free는 전일 자유일정 한 줄.
 * 모델이 style과 다른 칸을 채웠으면 채운 칸을 따른다.
 */
export function toDayPlans(
  parsed: z.infer<typeof itineraryResponseSchema>,
  expectedDays: number,
): DayPlan[] {
  return parsed.days.slice(0, expectedDays).map((day, index) => {
    const dayNo = index + 1;
    const base = { day: dayNo, theme: day.theme.trim(), overnightCity: day.overnightCity.trim() || undefined };
    const list = (raw: RawItem[], prefix: string) => raw.map((item, i) => toItem(item, `d${dayNo}-${prefix}-${i + 1}`, i === raw.length - 1));
    const full = day.fullDay ?? [];
    const style = day.style ?? "semi";
    if (style === "free" || (style !== "semi" && full.length === 0 && day.amGuided.length === 0)) {
      return linearDay(base, [freeItem(`d${dayNo}-free`, "전일 자유일정", 480, day.freeNote?.trim() || "가이드·차량 없이 자유롭게 보내는 날입니다.")], { rest: "free" });
    }
    if (style === "semi" && day.amGuided.length > 0 && day.pmFreeOptions.length >= 2) {
      return {
        ...base,
        kind: "semi" as const,
        items: [],
        amGuided: list(day.amGuided, "am"),
        pmFreeOptions: day.pmFreeOptions.map((option) => ({ id: option.id, title: option.title.trim(), items: list(option.items, `pm${option.id}`) })),
      };
    }
    const items = list(full.length > 0 ? full : [...day.amGuided, ...(day.pmFreeOptions[0]?.items ?? [])], "it");
    // 오전 자유 뒤 점심부터 시작하면 11:00 미팅 (호텔에서 30분 이동해 11:30 점심), 아니면 13:00 출발
    if (style === "late") return linearDay(base, items, { meetingTime: items[0]?.type === "meal" && /중식|점심|런치|lunch/i.test(`${items[0].name} ${items[0].description}`) ? "11:00" : "13:00", rest: "late" });
    if (style === "pmfree") {
      const last = items[items.length - 1];
      return linearDay(base, [...items.slice(0, -1), ...(last ? [{ ...last, travelMinutesToNext: 10 }] : []), freeItem(`d${dayNo}-pmfree`, "오후 자유시간", 210, "호텔 휴식 또는 개별 관광 (가이드·차량 없음)")], { rest: "pmfree" });
    }
    return linearDay(base, items);
  });
}
