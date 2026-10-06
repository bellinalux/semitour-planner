import { getSession, isAuthed, requireAdmin, workspaceId } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/external";
import { getKv } from "@/lib/server/planStore";
import { isQuoteLogEntry, MAX_QUOTE_LOG, type QuoteLogEntry } from "@/lib/quoteLog";

/**
 * 팀 공용 데이터 — 같은 접속 코드를 쓰는 직원끼리 함께 쓰는 값.
 *   GET  /api/team?kind=defaults|cost-memory|quote-log   조회
 *   PUT  /api/team?kind=defaults|cost-memory             통째로 저장 (회사 기본값, 여행지별 원가 기억)
 *   POST /api/team?kind=quote-log                        견적 이력 한 건 추가 (최근 MAX_QUOTE_LOG건만 남긴다)
 */
const KINDS = ["defaults", "cost-memory", "quote-log"] as const;
type Kind = (typeof KINDS)[number];
const MAX_BYTES = 256 * 1024;

async function open(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") as Kind | null;
  if (!kind || !KINDS.includes(kind)) return { error: errorResponse("BAD_REQUEST", "알 수 없는 항목입니다.", 400) } as const;
  const ws = await workspaceId();
  if (!ws) return { error: errorResponse("CLOUD_DISABLED", "서버 저장은 접속 코드(APP_ACCESS_CODE)를 등록해야 쓸 수 있습니다.", 403) } as const;
  if (!(await isAuthed(request))) return { error: errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401) } as const;
  const store = await getKv();
  if (!store) return { error: errorResponse("NO_STORE", "서버 저장소(KV)가 아직 연결되지 않았습니다.", 503) } as const;
  return { kind, key: `team:${ws}:${kind}`, kv: store.kv } as const;
}

async function readBody(request: Request): Promise<{ data: unknown } | Response> {
  const text = await request.text();
  if (text.length > MAX_BYTES) return errorResponse("TOO_LARGE", "저장할 내용이 너무 큽니다.", 413);
  try {
    return { data: (JSON.parse(text) as { data?: unknown })?.data };
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export async function GET(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  try {
    const raw = await ctx.kv.get(ctx.key);
    return Response.json({ data: raw ? JSON.parse(raw) : null });
  } catch (err) {
    console.error("[team:get]", err);
    return errorResponse("INTERNAL", "팀 데이터를 읽는 중 오류가 발생했습니다.", 500);
  }
}

export async function PUT(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  if (ctx.kind === "quote-log") return errorResponse("BAD_REQUEST", "견적 이력은 한 건씩 추가합니다.", 400);
  // 회사 기본값(마진·수수료 등)은 관리자만 바꾼다. 원가 기억은 견적을 만드는 모두가 쌓는다
  if (ctx.kind === "defaults") {
    const denied = await requireAdmin(request);
    if (denied) return denied;
  }
  const body = await readBody(request);
  if (body instanceof Response) return body;
  if (body.data !== null && !isRecord(body.data)) return errorResponse("BAD_REQUEST", "저장할 내용의 형식이 올바르지 않습니다.", 400);
  try {
    if (body.data === null) await ctx.kv.delete(ctx.key);
    else await ctx.kv.put(ctx.key, JSON.stringify(body.data));
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[team:put]", err);
    return errorResponse("INTERNAL", "팀 데이터를 저장하는 중 오류가 발생했습니다.", 500);
  }
}

export async function POST(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  if (ctx.kind !== "quote-log") return errorResponse("BAD_REQUEST", "이 항목은 통째로 저장합니다.", 400);
  const body = await readBody(request);
  if (body instanceof Response) return body;
  if (!isQuoteLogEntry(body.data)) return errorResponse("BAD_REQUEST", "견적 이력 형식이 올바르지 않습니다.", 400);
  // 작성자는 로그인한 사람 이름으로 남긴다 (직접 적은 이름보다 우선)
  const session = await getSession(request);
  if (session?.name) body.data = { ...body.data, author: session.name };
  try {
    const raw = await ctx.kv.get(ctx.key);
    const list = (raw ? (JSON.parse(raw) as unknown[]) : []).filter(isQuoteLogEntry) as QuoteLogEntry[];
    const next = [body.data, ...list.filter((e) => e.id !== (body.data as QuoteLogEntry).id)].slice(0, MAX_QUOTE_LOG);
    await ctx.kv.put(ctx.key, JSON.stringify(next));
    return Response.json({ data: next });
  } catch (err) {
    console.error("[team:post]", err);
    return errorResponse("INTERNAL", "견적 이력을 저장하는 중 오류가 발생했습니다.", 500);
  }
}
