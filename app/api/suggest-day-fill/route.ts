import { dayFillRequestSchema } from "@/lib/schemas/dayFill";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { suggestDayFill } from "@/lib/server/dayFill";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = dayFillRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    const result = await suggestDayFill(parsed.data);
    return Response.json(result);
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[suggest-day-fill]", err);
    return errorResponse("INTERNAL", "추천 일정을 만드는 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
