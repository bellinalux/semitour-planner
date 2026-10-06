import { getSession, isAuthed, requireAdmin, workspaceId } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/external";
import { getKv } from "@/lib/server/planStore";

/**
 * 직원 의견 — 쓰면서 불편한 점·바라는 점을 화면에서 바로 남기고, 관리자가 모아 본다(설정 화면을 줄이는 근거).
 *   POST /api/feedback { text, where }   남기기 (로그인한 누구나)
 *   GET  /api/feedback                   목록 (관리자)
 */
interface FeedbackEntry {
  id: string;
  at: string;
  author: string;
  text: string;
  /** 어느 화면·단계에서 남겼는지 */
  where: string;
}

const MAX_ENTRIES = 300;
const MAX_TEXT = 1000;

async function store() {
  const ws = await workspaceId();
  const kv = await getKv();
  if (!ws || !kv) return null;
  return { kv: kv.kv, key: `feedback:${ws}` };
}

async function readAll(kv: NonNullable<Awaited<ReturnType<typeof store>>>): Promise<FeedbackEntry[]> {
  try {
    const raw = await kv.kv.get(kv.key);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as FeedbackEntry[]) : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const s = await store();
  if (!s) return errorResponse("CLOUD_DISABLED", "서버 저장을 쓸 수 없어 의견을 모을 수 없습니다.", 403);
  return Response.json({ feedback: await readAll(s) });
}

export async function POST(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const s = await store();
  if (!s) return errorResponse("CLOUD_DISABLED", "서버 저장을 쓸 수 없어 의견을 보낼 수 없습니다.", 403);
  let body: { text?: unknown; where?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  if (!text) return errorResponse("BAD_REQUEST", "내용을 입력해 주세요.", 400);
  const session = await getSession(request);
  const entry: FeedbackEntry = {
    id: `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    author: session?.name || "이름 없음",
    text,
    where: typeof body.where === "string" ? body.where.slice(0, 80) : "",
  };
  try {
    await s.kv.put(s.key, JSON.stringify([entry, ...(await readAll(s))].slice(0, MAX_ENTRIES)));
  } catch {
    return errorResponse("INTERNAL", "의견을 저장하지 못했습니다.", 500);
  }
  return Response.json({ ok: true });
}
