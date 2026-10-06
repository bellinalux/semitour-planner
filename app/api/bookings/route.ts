import { MAX_BOOKINGS, parseBooking, withHistory, type Booking } from "@/lib/bookings";
import { getSession, workspaceId, type Session } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/external";
import { getKv } from "@/lib/server/planStore";

/**
 * 예약 관리 (팀 공용)
 *   GET    /api/bookings             목록
 *   PUT    /api/bookings { booking } 추가·수정 (상태·입금 변경은 서버가 이력에 남긴다)
 *   DELETE /api/bookings?id=         삭제 (만든 사람 또는 관리자)
 */
async function open(request: Request) {
  const ws = await workspaceId();
  if (!ws) return { error: errorResponse("CLOUD_DISABLED", "서버 저장은 접속 코드(APP_ACCESS_CODE)를 등록해야 쓸 수 있습니다.", 403) } as const;
  const session = await getSession(request);
  if (!session) return { error: errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401) } as const;
  const store = await getKv();
  if (!store) return { error: errorResponse("NO_STORE", "서버 저장소(KV)가 아직 연결되지 않았습니다.", 503) } as const;
  return { kv: store.kv, key: `bookings:${ws}`, session } as const;
}

type Ctx = Exclude<Awaited<ReturnType<typeof open>>, { error: Response }>;

async function readAll(ctx: Ctx): Promise<Booking[]> {
  try {
    const raw = await ctx.kv.get(ctx.key);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(list) ? list.map(parseBooking).filter((b): b is Booking => b !== null) : [];
  } catch {
    return [];
  }
}

const canDelete = (session: Session, b: Booking) => session.role === "admin" || (!!b.ownerId && b.ownerId === session.id);
const view = (session: Session, list: Booking[]) => list.map((b) => ({ ...b, canDelete: canDelete(session, b) }));

export async function GET(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  return Response.json({ bookings: view(ctx.session, await readAll(ctx)) });
}

export async function PUT(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  const text = await request.text();
  if (text.length > 64 * 1024) return errorResponse("TOO_LARGE", "내용이 너무 깁니다.", 413);
  let incoming: Booking | null = null;
  try {
    incoming = parseBooking((JSON.parse(text) as { booking?: unknown })?.booking);
  } catch {
    incoming = null;
  }
  if (!incoming) return errorResponse("BAD_REQUEST", "고객 이름과 예약 번호를 확인해 주세요.", 400);

  const list = await readAll(ctx);
  const prev = list.find((b) => b.id === incoming.id) ?? null;
  if (!prev && list.length >= MAX_BOOKINGS) return errorResponse("LIMIT", `예약은 ${MAX_BOOKINGS}건까지 저장할 수 있습니다. 오래된 예약을 정리해 주세요.`, 409);
  const by = ctx.session.name || "이름 없음";
  // 이력·만든 사람은 클라이언트가 보낸 값이 아니라 서버가 정한다
  const saved = withHistory(prev, { ...incoming, history: prev?.history ?? [], owner: prev?.owner ?? by, ownerId: prev?.ownerId ?? ctx.session.id }, by);
  const next = prev ? list.map((b) => (b.id === saved.id ? saved : b)) : [saved, ...list];
  try {
    await ctx.kv.put(ctx.key, JSON.stringify(next));
  } catch {
    return errorResponse("INTERNAL", "예약을 저장하지 못했습니다.", 500);
  }
  return Response.json({ booking: { ...saved, canDelete: canDelete(ctx.session, saved) } });
}

export async function DELETE(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const list = await readAll(ctx);
  const target = list.find((b) => b.id === id);
  if (!target) return errorResponse("NOT_FOUND", "없는 예약입니다.", 404);
  if (!canDelete(ctx.session, target)) return errorResponse("FORBIDDEN", "만든 사람이나 관리자만 삭제할 수 있습니다.", 403);
  try {
    await ctx.kv.put(
      ctx.key,
      JSON.stringify(list.filter((b) => b.id !== id)),
    );
  } catch {
    return errorResponse("INTERNAL", "예약을 삭제하지 못했습니다.", 500);
  }
  return Response.json({ ok: true });
}
