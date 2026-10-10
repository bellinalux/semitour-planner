import { z } from "zod";
import { guideLogSchema } from "@/lib/guideSheet";
import { addLog, getGuideSheet, setProgress } from "@/lib/server/guideStore";
import { allowGuideWrite } from "@/lib/server/rateLimit";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check"), key: z.string().max(80), done: z.boolean() }),
  z.object({ action: z.literal("log"), entry: guideLogSchema }),
]);

/** 가이드 페이지에서 — 진행 체크, 현장 기록 (링크를 받은 가이드. 접근 코드 없이, 1분 30번까지) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getGuideSheet(id))) return errorResponse("NOT_FOUND", "링크를 찾을 수 없습니다.", 404);
  if (!allowGuideWrite(request)) return errorResponse("RATE_LIMITED", "잠시 뒤에 다시 눌러 주세요.", 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return errorResponse("BAD_REQUEST", "내용을 확인해 주세요.", 400);
  const a = parsed.data;
  const state = a.action === "check" ? await setProgress(id, a.key, a.done) : await addLog(id, { ...a.entry, at: new Date().toISOString() });
  return Response.json(state);
}
