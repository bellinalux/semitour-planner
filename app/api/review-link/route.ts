import { REVIEW_ID, reviewLinkSchema } from "@/lib/reviews";
import { isAuthed } from "@/lib/server/access";
import { createReviewLink, reviewSummaries } from "@/lib/server/reviewStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/** 고객 만족도 링크 만들기 (직원만) */
export async function POST(request: Request) {
  // AI를 쓰지 않는 저장이라 호출 수 제한 없이 접근 코드만 확인한다
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const parsed = reviewLinkSchema.safeParse(body);
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "내용을 확인해 주세요.", 400);
  const id = await createReviewLink(parsed.data);
  if (!id) return errorResponse("NO_STORE", "서버 저장소(PLANS)가 연결되지 않아 링크를 만들 수 없습니다.", 503);
  return Response.json({ id, path: `/r/${id}` });
}

/** GET /api/review-link?ids=a,b — 링크별 후기 요약 (직원만) */
export async function GET(request: Request) {
  // AI를 쓰지 않는 저장이라 호출 수 제한 없이 접근 코드만 확인한다
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => REVIEW_ID.test(s));
  return Response.json({ summaries: ids.length > 0 ? await reviewSummaries([...new Set(ids)]) : [] });
}
