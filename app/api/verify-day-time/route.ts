import { dayTimeRequestSchema } from "@/lib/schemas/dayTime";
import { verifyDayTimes } from "@/lib/server/dayTimeVerify";
import { errorResponse, ExternalError } from "@/lib/server/external";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";

/** 일정 시간 검증 — 하루 방문 순서를 통째로 웹에서 확인해 구역별 소요시간·도보·이동 시간을 돌려준다 */
export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = dayTimeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    return Response.json(await verifyDayTimes(parsed.data));
  } catch (err) {
    if (err instanceof GeminiError || err instanceof ExternalError) return errorResponse(err.code, err.message, err.status);
    console.error("[verify-day-time]", err);
    return errorResponse("INTERNAL", "일정 시간 확인 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
