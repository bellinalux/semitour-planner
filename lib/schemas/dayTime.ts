import { z } from "zod";

/**
 * 일정 시간 검증 (하루 단위) — 장소를 하나씩 따로 보지 않고, 하루 방문 순서를 통째로 웹에서 확인해
 * 걸어서 함께 도는 장소들을 "구역"으로 묶고 구역별 총 소요시간·도보 이동·다음 구역까지 이동을 받는다.
 */

const itemSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  type: z.string().max(20),
  stayMinutes: z.number().min(0).max(1440),
});

export const dayTimeRequestSchema = z.object({
  destination: z.string().trim().max(100).default(""),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(60),
        city: z.string().trim().max(100).default(""),
        items: z.array(itemSchema).min(2).max(40),
      }),
    )
    .min(1)
    .max(14),
});
export type DayTimeRequest = z.infer<typeof dayTimeRequestSchema>;

/** AI가 정리하는 구역 (모델에게 보여 주는 스키마이기도 하다) */
export const dayTimeAreaSchema = z.object({
  name: z.string().describe("구역 이름 (예: 마카오 반도 역사지구, 타이파 빌리지)"),
  itemIds: z.array(z.string()).describe("이 구역에 묶인 항목 ID — 요청 순서대로, 서로 붙어 있는 항목만"),
  totalMinutes: z.number().describe("관광객이 이 구역을 보통 둘러보는 총 시간(분, 구역 안 도보 이동 포함, 식사 시간 제외). 확인 못했으면 0"),
  walkMinutes: z.number().describe("구역 안 장소 사이 보통 도보 시간(분). 확인 못했으면 0"),
  travelToNextMinutes: z.number().describe("이 구역 마지막 장소에서 다음 항목까지 이동 시간(분). 다음이 없거나 확인 못했으면 0"),
  sourceName: z.string().describe("근거로 삼은 출처 이름 (여행사 일정표·클룩·관광청 등). 없으면 빈 문자열"),
});
export type DayTimeArea = z.infer<typeof dayTimeAreaSchema>;

export const dayTimeResultSchema = z.object({ areas: z.array(dayTimeAreaSchema) });

export interface DayTimeDayResult {
  day: number;
  areas: DayTimeArea[];
  /** 웹 검색 근거로 확인했는지 (근거가 없으면 구역을 비운다) */
  searched: boolean;
}

export interface DayTimeResponse {
  days: DayTimeDayResult[];
  sources: { title: string; url: string }[];
  checkedAt: string;
}
