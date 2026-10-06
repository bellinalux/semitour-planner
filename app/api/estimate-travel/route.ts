import { travelRequestSchema, travelResponseSchema, toTravelEstimate } from "@/lib/schemas/travel";
import { GeminiError, generateGroundedText, generateJson } from "@/lib/server/gemini";
import { buildTravelResearchPrompt, buildTravelUserPrompt, TRAVEL_SYSTEM_PROMPT } from "@/lib/server/travelPrompt";
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

  const parsed = travelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    // 1단계: 웹 검색으로 시세 조사 → 2단계: 조사 메모로 숫자 정리 (검색이 안 되면 AI 추정으로 표시)
    // 같은 조건의 결과는 하루 동안 다시 쓴다 (검색 근거가 있는 결과만)
    const estimate = await cached(
      "travel",
      parsed.data,
      DAY,
      async () => {
        const research = await generateGroundedText({ user: buildTravelResearchPrompt(parsed.data) });
        const structured = await generateJson({
          system: TRAVEL_SYSTEM_PROMPT,
          user: buildTravelUserPrompt(parsed.data, research.searched ? research.text : ""),
          schema: travelResponseSchema,
          temperature: 0.2,
          timeoutMs: 60_000,
        });
        return { ...toTravelEstimate(structured), searched: research.searched, sources: research.sources.slice(0, 6) };
      },
      (r) => r.searched === true,
    );
    return Response.json({ estimate });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[estimate-travel]", err);
    return errorResponse("INTERNAL", "시세 추정 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
