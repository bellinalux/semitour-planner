/**
 * 스튜디오 보관소 — 상세페이지 스튜디오(tourdesign)를 어느 PC에서든 "접근 코드 로그인"만으로 이어 쓰게 한다 (2026-10-08)
 *  - 브라우저 저장 공간이 지워져도(정리 프로그램 등) 설정·보관함·템플릿·작업 중인 페이지를 서버에서 되살린다.
 *  - 다른 사이트에서 오는 요청이라 팀 보관함과 같은 방식(허용 사이트 + X-Studio-Code 헤더)으로 확인한다.
 *  GET  /api/studio/store?key=settings|snippets|templates|autosave → { key, value, savedAt } (없으면 value=null)
 *  POST /api/studio/store { key, value }                            → { key, savedAt }
 *  저장 위치: PLANS KV  tds:{작업공간}:{key}
 */
import { workspaceId } from "@/lib/server/access";
import { getKv } from "@/lib/server/planStore";
import { allowedOrigin, corsHeaders, studioAccess } from "@/lib/server/studio";

const STORE_KEYS = ["settings", "snippets", "templates", "autosave"] as const;
type StoreKey = (typeof STORE_KEYS)[number];
const MAX_BYTES = 10 * 1024 * 1024;   // KV 한 값 25MB 한도 안쪽 — 사진이 든 템플릿·작업본도 들어가게
const isKey = (k: string | null): k is StoreKey => !!k && (STORE_KEYS as readonly string[]).includes(k);
const kvKey = (ws: string, k: StoreKey) => `tds:${ws}:${k}`;

type Kv = NonNullable<Awaited<ReturnType<typeof getKv>>>["kv"];
type Ctx = { cors: Record<string, string>; ws: string; kv: Kv };

function err(code: string, message: string, status: number, headers: Record<string, string>) {
  return Response.json({ error: { code, message } }, { status, headers });
}

async function prepare(request: Request): Promise<Ctx | Response> {
  const origin = allowedOrigin(request);
  if (!origin) return Response.json({ error: { code: "ORIGIN", message: "허용되지 않은 사이트입니다." } }, { status: 403 });
  const cors = corsHeaders(origin);
  const access = await studioAccess(request);
  if (access === "off") return err("NO_ACCESS_CODE", "서버에 접근 코드(APP_ACCESS_CODE)를 설정해야 보관소를 쓸 수 있습니다.", 403, cors);
  if (access === "bad") return err("UNAUTHORIZED", "접근 코드가 올바르지 않습니다.", 401, cors);
  const ws = await workspaceId();
  const store = await getKv();
  if (!ws || !store) return err("NO_STORE", "서버 저장소(KV)가 준비되지 않았습니다.", 503, cors);
  return { cors, ws, kv: store.kv };
}

export async function OPTIONS(request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { ...corsHeaders(origin), "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
}

export async function GET(request: Request) {
  const c = await prepare(request); if (c instanceof Response) return c;
  const key = new URL(request.url).searchParams.get("key");
  if (!isKey(key)) return err("BAD_REQUEST", "보관 항목 이름이 올바르지 않습니다.", 400, c.cors);
  const raw = await c.kv.get(kvKey(c.ws, key));
  if (!raw) return Response.json({ key, value: null, savedAt: null }, { headers: c.cors });
  try {
    const stored = JSON.parse(raw) as { value: unknown; savedAt: string };
    return Response.json({ key, value: stored.value ?? null, savedAt: stored.savedAt ?? null }, { headers: c.cors });
  } catch {
    return Response.json({ key, value: null, savedAt: null }, { headers: c.cors });
  }
}

export async function POST(request: Request) {
  const c = await prepare(request); if (c instanceof Response) return c;
  const text = await request.text();
  if (text.length > MAX_BYTES) return err("TOO_LARGE", "저장할 내용이 너무 큽니다(사진을 줄여 주세요).", 413, c.cors);
  let body: { key?: unknown; value?: unknown };
  try { body = JSON.parse(text); } catch { return err("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400, c.cors); }
  const key = typeof body.key === "string" ? body.key : null;
  if (!isKey(key)) return err("BAD_REQUEST", "보관 항목 이름이 올바르지 않습니다.", 400, c.cors);
  if (body.value === undefined) return err("BAD_REQUEST", "저장할 내용이 없습니다.", 400, c.cors);
  const savedAt = new Date().toISOString();
  await c.kv.put(kvKey(c.ws, key), JSON.stringify({ value: body.value, savedAt }));
  return Response.json({ key, savedAt }, { headers: c.cors });
}
