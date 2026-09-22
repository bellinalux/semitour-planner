import { toTourCandidates, tourRequestSchema, tourResponseSchema } from "@/lib/schemas/tours";
import { GeminiError, generateGroundedText, generateJson } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { buildTourResearchPrompt, buildTourStructurePrompt, TOUR_STRUCTURE_SYSTEM_PROMPT } from "@/lib/server/tourPrompt";

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

  const parsed = tourRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    // 1단계: Google 검색으로 조사 (출처 수집)
    const research = await generateGroundedText({ user: buildTourResearchPrompt(parsed.data) });

    // 2단계: 조사 메모를 JSON으로 정리 (메모에 없는 내용은 만들지 않는다)
    const structured = await generateJson({
      system: TOUR_STRUCTURE_SYSTEM_PROMPT,
      user: buildTourStructurePrompt(parsed.data, research.text),
      schema: tourResponseSchema,
      temperature: 0.1,
    });

    let tours = toTourCandidates(structured, parsed.data.destination).map((t) =>
      // 검색 근거가 없으면 "검색 확인"과 "한국어 확인" 표시를 믿을 수 없으므로 낮춘다
      research.searched ? t : { ...t, priceBasis: "estimated" as const, koreanGuide: false, koreanNote: "" },
    );

    // 모델이 지시를 놓쳐 다른 업체 투어를 섞어 보낼 수 있으므로, 운영사 이름을 한 번 더 코드로 걸러낸다
    const operator = parsed.data.operatorName.trim();
    if (operator) {
      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
      const target = norm(operator);
      tours = tours.filter((t) => norm(t.operator).includes(target) || target.includes(norm(t.operator)));
    }

    if (tours.length === 0) {
      return errorResponse(
        "BAD_OUTPUT",
        operator
          ? `"${operator}"이(가) 운영하는 투어를 웹에서 찾지 못했습니다. 업체명 표기를 바꾸거나 투어 종류를 조정해 다시 시도해 주세요.`
          : "조건에 맞는 투어를 찾지 못했습니다. 종류를 바꿔서 다시 시도해 주세요.",
        422,
      );
    }
    return Response.json({
      tours,
      sources: research.sources,
      searched: research.searched,
      searchedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[find-tours]", err);
    return errorResponse("INTERNAL", "투어 검색 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
