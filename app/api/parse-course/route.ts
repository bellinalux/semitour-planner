import { courseRequestSchema, courseResponseSchema, toCoursePlan } from "@/lib/schemas/course";
import { buildCourseUserPrompt, COURSE_SYSTEM_PROMPT } from "@/lib/server/coursePrompt";
import { GeminiError, generateJson } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";

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

  const parsed = courseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    const result = await generateJson({
      system: COURSE_SYSTEM_PROMPT,
      user: buildCourseUserPrompt(parsed.data),
      schema: courseResponseSchema,
      temperature: 0.2,
      timeoutMs: 90_000,
      files: parsed.data.file ? [parsed.data.file] : [],
    });
    if (result.days.length === 0) {
      return errorResponse(
        "BAD_OUTPUT",
        "코스에서 일정을 찾지 못했습니다. DAY 1, DAY 2처럼 일차가 구분된 코스를 붙여넣어 주세요.",
        422,
      );
    }
    return Response.json(toCoursePlan(result));
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[parse-course]", err);
    return errorResponse("INTERNAL", "코스 분석 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
