import { groundCostRequestSchema } from "@/lib/schemas/groundCost";
import { GeminiError } from "@/lib/server/gemini";
import { estimateGroundCost } from "@/lib/server/groundCost";
import { guardRequest } from "@/lib/server/guard";
import { cached, DAY } from "@/lib/server/aiCache";

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

  const parsed = groundCostRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    // 차량·가이드 시세는 자주 바뀌지 않으므로 검색 근거가 있는 결과를 7일 동안 다시 쓴다
    return Response.json(await cached("ground", parsed.data, 7 * DAY, () => estimateGroundCost(parsed.data), (r) => r.searched));
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[estimate-ground]", err);
    return errorResponse("INTERNAL", "차량·가이드 요금 추정 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
