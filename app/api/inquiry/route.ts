import { z } from "zod";
import { inquirySchema, type Inquiry } from "@/lib/inquiry";
import { isAuthed, workspaceId } from "@/lib/server/access";
import { getKv } from "@/lib/server/planStore";
import { allowPublicWrite } from "@/lib/server/rateLimit";
import { newShareId } from "@/lib/server/shareStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const MAX = 300;
const keyOf = async () => `inquiries:${(await workspaceId()) ?? "local"}`;

async function read(): Promise<Inquiry[]> {
  const store = await getKv();
  const raw = store ? await store.kv.get(await keyOf()) : null;
  try {
    const list = raw ? (JSON.parse(raw) as Inquiry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function write(list: Inquiry[]): Promise<boolean> {
  const store = await getKv();
  if (!store) return false;
  await store.kv.put(await keyOf(), JSON.stringify(list.slice(0, MAX)));
  return true;
}

/** 고객 견적 요청 (공개 폼) — 한 곳에서 1분 5번까지 */
export async function POST(request: Request) {
  if (!allowPublicWrite(request)) return errorResponse("RATE_LIMITED", "잠시 뒤에 다시 보내 주세요.", 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", 400);
  const { website: _honeypot, ...data } = parsed.data;
  void _honeypot;
  const item: Inquiry = { ...data, id: newShareId(), at: new Date().toISOString(), done: false };
  if (!(await write([item, ...(await read())]))) return errorResponse("NO_STORE", "지금은 접수할 수 없습니다. 전화로 문의해 주세요.", 503);
  return Response.json({ ok: true });
}

/** 접수된 견적 요청 (직원만) */
export async function GET(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  return Response.json({ inquiries: await read() });
}

/** 처리 완료 표시 (직원만) */
export async function PATCH(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const parsed = z.object({ id: z.string().max(60), done: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  const list = (await read()).map((i) => (i.id === parsed.data.id ? { ...i, done: parsed.data.done } : i));
  await write(list);
  return Response.json({ inquiries: list });
}
