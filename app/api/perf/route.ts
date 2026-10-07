import { isPerfEntry, MAX_PERF, type PerfEntry } from "@/lib/perf";
import { getSession, requireAdmin, workspaceId } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/external";
import { getKv } from "@/lib/server/planStore";

/**
 * 속도 기록 — 직원이 실제로 쓸 때 걸린 시간(코스 만들기, 자동 견적 단계별)을 모은다.
 *   POST /api/perf  한 건 기록 (로그인한 누구나)
 *   GET  /api/perf  최근 기록 (관리자)
 */
async function store() {
  const ws = await workspaceId();
  const kv = await getKv();
  return ws && kv ? { kv: kv.kv, key: `perf:${ws}` } : null;
}

async function readAll(s: NonNullable<Awaited<ReturnType<typeof store>>>): Promise<PerfEntry[]> {
  try {
    const raw = await s.kv.get(s.key);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(list) ? (list.filter(isPerfEntry) as PerfEntry[]) : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const s = await store();
  if (!s) return errorResponse("CLOUD_DISABLED", "서버 저장을 쓸 수 없어 속도 기록이 없습니다.", 403);
  return Response.json({ perf: await readAll(s) });
}

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const s = await store();
  if (!s) return Response.json({ ok: false });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  if (!isPerfEntry(body)) return errorResponse("BAD_REQUEST", "기록 형식이 올바르지 않습니다.", 400);
  const entry: PerfEntry = { ...body, at: new Date().toISOString(), by: session.name };
  try {
    await s.kv.put(s.key, JSON.stringify([entry, ...(await readAll(s))].slice(0, MAX_PERF)));
  } catch {
    return Response.json({ ok: false });
  }
  return Response.json({ ok: true });
}
