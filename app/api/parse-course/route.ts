import { isVisualCourseFile } from "@/lib/courseFile";
import { courseRequestSchema, courseResponseSchema, toCoursePlan, type CourseRequest } from "@/lib/schemas/course";
import { extractCourseFileText } from "@/lib/server/courseFileExtract";
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

  // 사진·PDF는 Gemini가 파일을 직접 읽는다. 엑셀·한글(HWP)·텍스트는 서버에서 먼저 글자를 뽑아
  // 원문 텍스트처럼 취급한다 (Gemini가 직접 읽을 수 없는 형식이라서).
  let req: CourseRequest = parsed.data;
  if (parsed.data.file && !isVisualCourseFile(parsed.data.file.name)) {
    let extractedText: string;
    try {
      extractedText = (await extractCourseFileText(parsed.data.file)).text;
    } catch (err) {
      return errorResponse("BAD_REQUEST", err instanceof Error ? err.message : "파일을 읽지 못했습니다.", 422);
    }
    if (!extractedText.trim()) {
      return errorResponse("BAD_OUTPUT", "파일에서 코스 내용을 찾지 못했습니다. 다른 파일로 다시 시도해 주세요.", 422);
    }
    const note = parsed.data.text.trim();
    req = {
      ...parsed.data,
      text: note ? `${extractedText}\n\n<추가 설명>\n${note}` : extractedText,
      file: undefined,
    };
  }

  try {
    const result = await generateJson({
      system: COURSE_SYSTEM_PROMPT,
      user: buildCourseUserPrompt(req),
      schema: courseResponseSchema,
      temperature: 0.2,
      timeoutMs: 90_000,
      files: req.file ? [req.file] : [],
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
