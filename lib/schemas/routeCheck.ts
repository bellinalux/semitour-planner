import { z } from "zod";

/** 하루(또는 오전/오후 한 세션)의 방문 순서가 지그재그로 비효율적인지 확인하는 요청 */
export const routeCheckRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  /** 그 세션이 속한 도시 (여러 도시를 도는 코스에서 더 정확한 위치 확인에 쓴다) */
  city: z.string().trim().max(60).optional(),
  /** 방문 순서대로 나열한 장소 목록 */
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        name: z.string().trim().min(1).max(120),
      }),
    )
    .min(3, "3곳 이상일 때 동선을 확인할 수 있습니다.")
    .max(12, "한 번에 12곳까지 확인할 수 있습니다."),
});

export type RouteCheckRequest = z.infer<typeof routeCheckRequestSchema>;

/** ---------- LLM 응답 ---------- */

export const routeCheckResultSchema = z.object({
  isZigzag: z.boolean().describe("현재 방문 순서가 위치상 비효율적으로 왔다갔다하는 동선이면 true. 애매하면 false"),
  reason: z.string().describe("판단 이유 한두 문장. 확인한 위치 관계를 구체적으로 근거로 씀 (예: 'OO과 OO은 도보 5분 거리인데 사이에 OO을 배치해 왕복 이동이 생김')"),
  suggestedOrder: z.array(z.string()).describe("더 효율적인 방문 순서(항목 id 전체). isZigzag가 true일 때만 채우고, 아니면 빈 배열"),
});

export type RouteCheckResult = z.infer<typeof routeCheckResultSchema>;

export interface RouteCheckResponse extends RouteCheckResult {
  sources: { title: string; url: string }[];
  searched: boolean;
}
