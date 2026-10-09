import { z } from "zod";

/** 동선상 식당 찾기 — 식사 시간에 일행이 있는 지역 안에서 단체가 갈 만한 식당을 찾는다 */
export const restaurantRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  /** 식사 무렵 일행이 있는 지역 (예: 콜로안) */
  region: z.string().trim().min(1).max(60),
  /** 그 앞뒤로 들르는 장소 (가까운 식당을 찾는 기준) */
  nearPlaces: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
  meal: z.enum(["lunch", "dinner"]),
  /** 원래 식당의 음식 종류 (예: 딤섬, 한식) — 같은 종류를 우선 */
  cuisine: z.string().trim().max(40).default(""),
  /** 원래 식당 이름 — 다시 추천하지 않는다 */
  current: z.string().trim().max(120).default(""),
  travelers: z.number().int().min(1).max(60),
  tripScope: z.enum(["domestic", "overseas"]).default("overseas"),
  currency: z.enum(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]),
});
export type RestaurantRequest = z.infer<typeof restaurantRequestSchema>;

const restaurantSchema = z.object({
  name: z.string().describe("식당 이름 (현지에서 검색 가능한 실제 이름)"),
  cuisine: z.string().describe("음식 종류 짧게 (예: 딤섬, 포르투갈식, 한식)"),
  area: z.string().describe("식당이 있는 구역·거리 (예: 콜로안 빌리지 광장 앞)"),
  walkMinutes: z.number().describe("기준 장소에서 걸어서 몇 분인지. 모르면 0"),
  mealCost: z.number().describe("1인 식대 (요청 통화 단위). 모르면 0"),
  groupOk: z.boolean().describe("단체(요청 인원) 수용·예약이 된다고 확인했으면 true"),
  reason: z.string().describe("추천 근거 한 문장 (여행사 일정표·후기 등에서 확인한 것)"),
  sourceName: z.string().describe("확인한 출처 이름. 없으면 빈 문자열"),
});

export const restaurantResultSchema = z.object({
  restaurants: z.array(restaurantSchema).max(3).describe("가까운 순서로 최대 3곳. 근거 있는 곳이 없으면 빈 배열"),
});
export type RestaurantCandidate = z.infer<typeof restaurantSchema>;

export interface RestaurantResponse {
  restaurants: RestaurantCandidate[];
  sources: { title: string; url: string }[];
  searched: boolean;
}
