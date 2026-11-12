import { seasonRequestSchema } from "@/lib/schemas/season";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { checkSeason } from "@/lib/server/seasonCheck";
import { withAiInfo } from "@/lib/server/aiProviders";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/** 출발 시기 확인 — 날씨·현지 공휴일·축제·휴관·성수기 혼잡 */
async function handlePost(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const parsed = seasonRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);

  try {
    return Response.json(await checkSeason(parsed.data));
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[season-check]", err);
    return errorResponse("INTERNAL", "출발 시기를 확인하는 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}

/** 대체 AI(Groq·Cloudflare)가 답하면 응답 머리글로 화면에 알린다 */
export const POST = withAiInfo(handlePost);
