import { uspRequestSchema, uspResponseSchema } from "@/lib/schemas/usp";
import { GeminiError, generateJson } from "@/lib/server/gemini";
import { buildUspUserPrompt, USP_SYSTEM_PROMPT } from "@/lib/server/uspPrompt";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = uspRequestSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[generate-usp] 요청 검증 실패:", parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`));
    return errorResponse("BAD_REQUEST", "USP 생성에 필요한 정보가 올바르지 않습니다.", 400);
  }

  try {
    const result = await generateJson({
      system: USP_SYSTEM_PROMPT,
      user: buildUspUserPrompt(parsed.data),
      schema: uspResponseSchema,
      temperature: 0.6,
      timeoutMs: 60_000,
    });
    return Response.json({
      usps: result.usps.map((u) => ({ title: u.title.trim(), reason: u.reason.trim() })),
    });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[generate-usp]", err);
    return errorResponse("INTERNAL", "USP 생성 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
