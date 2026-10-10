import { shareRequestSchema } from "@/lib/shareItinerary";
import { guardRequest } from "@/lib/server/guard";
import { newShareId, putShared } from "@/lib/server/shareStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/** 고객용 웹 일정표 링크 만들기·고치기 (직원만 — 접근 코드 확인). 보는 쪽(/t/아이디)은 링크만 있으면 열린다 */
export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const parsed = shareRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "일정표 내용을 확인해 주세요.", 400);

  const id = parsed.data.id ?? newShareId();
  try {
    const ok = await putShared(id, parsed.data.itinerary);
    if (!ok) return errorResponse("NO_STORE", "서버 저장소(PLANS)가 연결되지 않아 링크를 만들 수 없습니다.", 503);
    return Response.json({ id, path: `/t/${id}` });
  } catch (err) {
    console.error("[share]", err);
    return errorResponse("INTERNAL", "링크를 만드는 중 오류가 발생했습니다.", 500);
  }
}
