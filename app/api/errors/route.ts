/**
 * 오류 기록 API
 *  POST   /api/errors           화면에서 난 오류 보내기 (세미투어 · 상세페이지 스튜디오 — 다른 사이트·PC 파일에서도, 로그인 없이)
 *  GET    /api/errors           최근 오류 목록 (로그인한 사람만)
 *  GET    /api/errors?id=...    한 건 자세히 (로그인한 사람만)
 *  DELETE /api/errors           모두 지우기 (로그인한 사람만)
 * 보내기는 로그인 없이 받으므로 크기·횟수를 제한하고, 같은 오류는 한 건으로 묶는다.
 */
import { isAuthed } from "@/lib/server/access";
import { clearErrors, getError, listErrors, recordError, reportSchema } from "@/lib/server/errorLog";
import { clientKey } from "@/lib/server/rateLimit";
import { allowedOrigin, corsHeaders } from "@/lib/server/studio";

const MAX_BODY = 16 * 1024;
const PER_MINUTE = 30;
const recent = new Map<string, number[]>();

function allow(key: string): boolean {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= PER_MINUTE) return false;
  list.push(now);
  recent.set(key, list);
  if (recent.size > 2000) recent.clear();
  return true;
}

function cors(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  return origin ? corsHeaders(origin) : {};
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function POST(request: Request) {
  const headers = cors(request);
  if (!allow(clientKey(request))) return new Response(null, { status: 429, headers });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413, headers });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400, headers });
  }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400, headers });
  try {
    await recordError(parsed.data);
  } catch (e) {
    console.error("[errors] 기록 실패", e);
  }
  return new Response(null, { status: 204, headers });
}

export async function GET(request: Request) {
  if (!(await isAuthed(request))) return Response.json({ error: { code: "UNAUTHORIZED", message: "접근 코드가 필요합니다." } }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const entry = await getError(id);
    return entry ? Response.json(entry) : Response.json({ error: { code: "NOT_FOUND", message: "기록이 없습니다." } }, { status: 404 });
  }
  return Response.json({ errors: await listErrors() });
}

export async function DELETE(request: Request) {
  if (!(await isAuthed(request))) return Response.json({ error: { code: "UNAUTHORIZED", message: "접근 코드가 필요합니다." } }, { status: 401 });
  return Response.json({ deleted: await clearErrors() });
}
