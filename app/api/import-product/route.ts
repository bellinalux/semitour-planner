/** POST /api/import-product { url } — 다른 여행사 상품 링크에서 코스·가격·항공 읽기 */
import { productImportRequestSchema } from "@/lib/schemas/productImport";
import { withAiInfo } from "@/lib/server/aiProviders";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { importProduct } from "@/lib/server/productImport";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

async function handlePost(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;
  const parsed = productImportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "링크를 확인해 주세요.", 400);
  try {
    return Response.json(await importProduct(parsed.data));
  } catch (err) {
    if (err instanceof Error && err.message === "BAD_URL") return errorResponse("BAD_URL", "읽을 수 없는 링크입니다 (내부 주소·IP 주소는 안 됨).", 400);
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[import-product]", err);
    return errorResponse("INTERNAL", "상품을 읽는 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}

/** 대체 AI(Groq·Cloudflare)가 답하면 응답 머리글로 화면에 알린다 */
export const POST = withAiInfo(handlePost);
