import { findDuplicatesRequestSchema, duplicateResultSchema } from "@/lib/schemas/duplicates";
import { GeminiError, generateJson } from "@/lib/server/gemini";
import { buildDuplicateUserPrompt, DUPLICATE_SYSTEM_PROMPT } from "@/lib/server/duplicatesPrompt";
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

  const parsed = findDuplicatesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    // 웹 검색이 필요 없는 순수 텍스트 비교라 바로 구조화 호출 하나로 끝낸다
    const result = await generateJson({
      system: DUPLICATE_SYSTEM_PROMPT,
      user: buildDuplicateUserPrompt(parsed.data),
      schema: duplicateResultSchema,
      temperature: 0,
      timeoutMs: 30_000,
    });

    // 존재하지 않는 id나 새 항목 자신을 가리키는 id는 걸러낸다
    const candidateIds = new Set(parsed.data.candidates.map((c) => c.id));
    const duplicateIds = result.duplicateIds.filter((id) => candidateIds.has(id));

    return Response.json({ duplicateIds });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[find-duplicate-items]", err);
    return errorResponse("INTERNAL", "중복 확인 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
