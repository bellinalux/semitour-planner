import { REVIEW_ID, reviewSchema } from "@/lib/reviews";
import { allowPublicWrite } from "@/lib/server/rateLimit";
import { addReview } from "@/lib/server/reviewStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/** 고객 후기 남기기 (공개 — 링크를 받은 고객). 직원이 만든 링크에만, 한 곳에서 1분 5번까지, 링크당 100건까지 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!REVIEW_ID.test(id)) return errorResponse("NOT_FOUND", "링크를 찾을 수 없습니다.", 404);
  if (!allowPublicWrite(request)) return errorResponse("RATE_LIMITED", "잠시 뒤에 다시 보내 주세요.", 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return errorResponse("BAD_REQUEST", "별점을 골라 주세요.", 400);
  try {
    const r = await addReview(id, { ...parsed.data, at: new Date().toISOString() });
    if (r === "missing") return errorResponse("NOT_FOUND", "링크가 만료되었거나 잘못되었습니다.", 404);
    if (r === "full") return errorResponse("FULL", "이 링크는 더 이상 후기를 받지 않습니다.", 409);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[review]", err);
    return errorResponse("INTERNAL", "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 500);
  }
}
