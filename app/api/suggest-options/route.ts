import { suggestOptionsRequestSchema } from "@/lib/schemas/optionSuggest";
import { errorResponse, ExternalError } from "@/lib/server/external";
import { suggestOptions } from "@/lib/server/optionSuggest";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";

export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = suggestOptionsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    return Response.json(await suggestOptions(parsed.data));
  } catch (err) {
    if (err instanceof GeminiError || err instanceof ExternalError) return errorResponse(err.code, err.message, err.status);
    console.error("[suggest-options]", err);
    return errorResponse("INTERNAL", "선택 옵션 추천 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
