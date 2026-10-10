import { z } from "zod";
import { guideSheetSchema } from "@/lib/guideSheet";
import { isAuthed } from "@/lib/server/access";
import { getGuideState, putGuideSheet } from "@/lib/server/guideStore";
import { newShareId, SHARE_ID } from "@/lib/server/shareStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const requestSchema = z.object({ id: z.string().regex(SHARE_ID).optional(), sheet: guideSheetSchema });

/** 가이드 운영 페이지 링크 만들기·고치기 (직원만) — 같은 아이디면 일정만 바꾸고 현장 기록은 그대로 */
export async function POST(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "내용을 확인해 주세요.", 400);
  const id = parsed.data.id ?? newShareId();
  if (!(await putGuideSheet(id, parsed.data.sheet))) return errorResponse("NO_STORE", "서버 저장소(PLANS)가 연결되지 않아 링크를 만들 수 없습니다.", 503);
  return Response.json({ id, path: `/g/${id}` });
}

/** GET /api/guide?id= — 현장 진행·기록 (직원만) */
export async function GET(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!SHARE_ID.test(id)) return errorResponse("BAD_REQUEST", "링크 아이디가 올바르지 않습니다.", 400);
  return Response.json(await getGuideState(id));
}
