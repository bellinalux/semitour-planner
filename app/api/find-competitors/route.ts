import { competitorRequestSchema, competitorResponseSchema, toCompetitorCandidates } from "@/lib/schemas/competitors";
import {
  buildCompetitorResearchPrompt,
  buildCompetitorStructurePrompt,
  COMPETITOR_STRUCTURE_SYSTEM_PROMPT,
} from "@/lib/server/competitorPrompt";
import { errorResponse } from "@/lib/server/external";
import { GeminiError, generateGroundedText, generateJson } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { cached, DAY } from "@/lib/server/aiCache";

export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = competitorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    // 같은 조건의 경쟁 상품 조사는 3일 동안 다시 쓴다 (검색 근거가 있고 상품을 찾은 결과만)
    const result = await cached(
      "competitors",
      parsed.data,
      3 * DAY,
      async () => {
        // 1단계: Google 검색으로 조사 (출처 수집)
        const research = await generateGroundedText({ user: buildCompetitorResearchPrompt(parsed.data), fast: true });

        // 2단계: 조사 메모를 JSON으로 정리 (메모에 없는 내용은 만들지 않는다)
        const structured = await generateJson({
          fast: true,
          system: COMPETITOR_STRUCTURE_SYSTEM_PROMPT,
          user: buildCompetitorStructurePrompt(parsed.data, research.text),
          schema: competitorResponseSchema,
          temperature: 0.1,
        });

        const products = toCompetitorCandidates(structured).map((p) =>
          // 검색 근거가 없으면 "확인" 표시를 믿을 수 없으므로 낮춘다
          research.searched ? p : { ...p, basis: "estimated" as const, sourceName: "" },
        );
        return { products, sources: research.sources, searched: research.searched, searchedAt: new Date().toISOString() };
      },
      (r) => r.searched && r.products.length > 0,
    );
    if (result.products.length === 0) {
      return errorResponse("BAD_OUTPUT", "비슷한 경쟁 상품을 찾지 못했습니다. 여행지나 기간을 조정해 다시 시도해 주세요.", 422);
    }
    return Response.json(result);
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[find-competitors]", err);
    return errorResponse("INTERNAL", "경쟁사 조사 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
