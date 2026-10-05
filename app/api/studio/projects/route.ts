/**
 * 팀 보관함 API (상세페이지 스튜디오용, 다른 사이트에서 호출 — CORS + X-Studio-Code 헤더)
 *  GET    /api/studio/projects                    → { projects: 목록 }
 *  GET    /api/studio/projects?id=…               → { project: 최신본(데이터·검수 기록 포함) }
 *  GET    /api/studio/projects?id=…&versions=1    → { versions: 버전 목록 }
 *  GET    /api/studio/projects?id=…&ver=3         → { version: { meta, data } }
 *  POST   /api/studio/projects  { id?, title, status, note, by, baseVersion?, force?, data } → { entry } | 409 { conflict }
 *  DELETE /api/studio/projects?id=…
 */
import { workspaceId } from "@/lib/server/access";
import { getKv } from "@/lib/server/planStore";
import { allowedOrigin, corsHeaders, studioAccess } from "@/lib/server/studio";
import {
  deleteProject, getProject, getVersion, listProjects, listVersions, MAX_PROJECT_BYTES, PROJECT_ID, saveProject, saveSchema,
} from "@/lib/server/studioProjects";

type Ctx = { cors: Record<string, string>; ws: string; kv: NonNullable<Awaited<ReturnType<typeof getKv>>>["kv"] };

function err(code: string, message: string, status: number, headers: Record<string, string>) {
  return Response.json({ error: { code, message } }, { status, headers });
}

/** 공통 확인: 허용 사이트 → 접근 코드 → 작업공간·저장소 */
async function prepare(request: Request): Promise<Ctx | Response> {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(JSON.stringify({ error: { code: "ORIGIN", message: "허용되지 않은 사이트입니다." } }), { status: 403, headers: { "Content-Type": "application/json" } });
  const cors = corsHeaders(origin);
  const access = await studioAccess(request);
  if (access === "off") return err("NO_ACCESS_CODE", "서버에 접근 코드(APP_ACCESS_CODE)를 설정해야 팀 보관함을 쓸 수 있습니다.", 403, cors);
  if (access === "bad") return err("UNAUTHORIZED", "접근 코드가 올바르지 않습니다.", 401, cors);
  const ws = await workspaceId();
  const store = await getKv();
  if (!ws || !store) return err("NO_STORE", "서버 저장소(KV)가 준비되지 않았습니다.", 503, cors);
  return { cors, ws, kv: store.kv };
}

export async function OPTIONS(request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { ...corsHeaders(origin), "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS" } });
}

export async function GET(request: Request) {
  const c = await prepare(request); if (c instanceof Response) return c;
  const q = new URL(request.url).searchParams;
  const id = q.get("id");
  if (!id) return Response.json({ projects: await listProjects(c.kv, c.ws) }, { headers: c.cors });
  if (!PROJECT_ID.test(id)) return err("BAD_REQUEST", "프로젝트 번호가 올바르지 않습니다.", 400, c.cors);
  if (q.get("versions")) return Response.json({ versions: await listVersions(c.kv, c.ws, id) }, { headers: c.cors });
  const ver = q.get("ver");
  if (ver) {
    const v = await getVersion(c.kv, c.ws, id, Number(ver));
    return v ? Response.json({ version: v }, { headers: c.cors }) : err("NOT_FOUND", "그 버전이 없습니다.", 404, c.cors);
  }
  const p = await getProject(c.kv, c.ws, id);
  return p ? Response.json({ project: p }, { headers: c.cors }) : err("NOT_FOUND", "프로젝트가 없습니다.", 404, c.cors);
}

export async function POST(request: Request) {
  const c = await prepare(request); if (c instanceof Response) return c;
  const text = await request.text();
  if (text.length > MAX_PROJECT_BYTES) return err("TOO_LARGE", "프로젝트가 너무 큽니다(사진을 줄여 주세요).", 413, c.cors);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return err("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400, c.cors); }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return err("BAD_REQUEST", "저장할 내용이 올바르지 않습니다.", 400, c.cors);
  const r = await saveProject(c.kv, c.ws, parsed.data);
  if (!r.ok) return Response.json({ error: { code: "CONFLICT", message: "그 사이 다른 사람이 저장했습니다." }, conflict: r.conflict }, { status: 409, headers: c.cors });
  return Response.json({ entry: r.entry }, { headers: c.cors });
}

export async function DELETE(request: Request) {
  const c = await prepare(request); if (c instanceof Response) return c;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!PROJECT_ID.test(id)) return err("BAD_REQUEST", "프로젝트 번호가 올바르지 않습니다.", 400, c.cors);
  await deleteProject(c.kv, c.ws, id);
  return Response.json({ ok: true }, { headers: c.cors });
}
