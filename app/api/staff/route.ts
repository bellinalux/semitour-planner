import { codeMatches, getSession, requireAdmin, workspaceId, workspaceInfo } from "@/lib/server/access";
import { audit } from "@/lib/server/audit";
import { errorResponse } from "@/lib/server/external";
import { hashStaffCode, listStaff, MAX_STAFF, MIN_CODE_LENGTH, newStaffId, saveStaff, toView, type StaffMember, type StaffRole } from "@/lib/server/staff";

/**
 * 직원 계정 관리 (관리자만)
 *   GET    /api/staff                         목록
 *   POST   /api/staff  { name, role, code }   추가
 *   PATCH  /api/staff  { id, name?, role?, active?, code? }  수정 (code를 주면 새 코드로 바꾼다)
 *   DELETE /api/staff?id=                      삭제
 */
async function open(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return { error: denied } as const;
  const ws = await workspaceId();
  if (!ws) return { error: errorResponse("CLOUD_DISABLED", "직원 계정은 접속 코드(APP_ACCESS_CODE)를 등록해야 쓸 수 있습니다.", 403) } as const;
  return { ws, session: await getSession(request) } as const;
}

const ROLES: StaffRole[] = ["admin", "staff"];
const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 30) : "");

async function checkCode(ws: string, code: unknown, list: StaffMember[], exceptId?: string): Promise<string | null> {
  if (typeof code !== "string" || code.trim().length < MIN_CODE_LENGTH) return `개인 코드는 ${MIN_CODE_LENGTH}자 이상이어야 합니다.`;
  if (code.trim().length > 64) return "개인 코드가 너무 깁니다.";
  if (await codeMatches(code)) return "관리자 접속 코드와 같은 코드는 쓸 수 없습니다.";
  const hash = await hashStaffCode(ws, code);
  if (list.some((m) => m.id !== exceptId && m.codeHash === hash)) return "다른 직원이 이미 쓰는 코드입니다.";
  return null;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  return Response.json({ staff: (await listStaff(ctx.ws, true)).map(toView), workspace: await workspaceInfo() });
}

export async function POST(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  if (!body) return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  const name = cleanName(body.name);
  if (!name) return errorResponse("BAD_REQUEST", "이름을 입력해 주세요.", 400);
  const role = ROLES.includes(body.role as StaffRole) ? (body.role as StaffRole) : "staff";
  const list = await listStaff(ctx.ws, true);
  if (list.length >= MAX_STAFF) return errorResponse("TOO_MANY", `직원은 ${MAX_STAFF}명까지 등록할 수 있습니다.`, 400);
  const codeError = await checkCode(ctx.ws, body.code, list);
  if (codeError) return errorResponse("BAD_REQUEST", codeError, 400);
  const member: StaffMember = {
    id: newStaffId(),
    name,
    role,
    codeHash: await hashStaffCode(ctx.ws, body.code as string),
    active: true,
    createdAt: new Date().toISOString(),
  };
  try {
    await saveStaff(ctx.ws, [...list, member]);
  } catch {
    return errorResponse("NO_STORE", "서버 저장소(KV)가 연결되지 않았습니다.", 503);
  }
  await audit(ctx.ws, ctx.session, "직원 추가", `${member.name} (${member.role === "admin" ? "관리자" : "직원"})`);
  return Response.json({ member: toView(member) });
}

export async function PATCH(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  const body = await readJson(request);
  if (!body || typeof body.id !== "string") return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  const list = await listStaff(ctx.ws, true);
  const current = list.find((m) => m.id === body.id);
  if (!current) return errorResponse("NOT_FOUND", "없는 직원입니다.", 404);

  const next: StaffMember = { ...current };
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return errorResponse("BAD_REQUEST", "이름을 입력해 주세요.", 400);
    next.name = name;
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as StaffRole)) return errorResponse("BAD_REQUEST", "권한이 올바르지 않습니다.", 400);
    next.role = body.role as StaffRole;
  }
  if (body.active !== undefined) next.active = body.active === true;
  if (body.code !== undefined) {
    const codeError = await checkCode(ctx.ws, body.code, list, current.id);
    if (codeError) return errorResponse("BAD_REQUEST", codeError, 400);
    next.codeHash = await hashStaffCode(ctx.ws, body.code as string);
  }
  try {
    await saveStaff(
      ctx.ws,
      list.map((m) => (m.id === next.id ? next : m)),
    );
  } catch {
    return errorResponse("NO_STORE", "서버 저장소(KV)가 연결되지 않았습니다.", 503);
  }
  const changes = [body.role !== undefined ? `권한 ${next.role === "admin" ? "관리자" : "직원"}` : "", body.active !== undefined ? (next.active ? "접속 허용" : "접속 막기") : "", body.code !== undefined ? "코드 변경" : "", body.name !== undefined ? "이름 변경" : ""].filter(Boolean).join(", ");
  await audit(ctx.ws, ctx.session, "직원 수정", `${next.name}: ${changes}`);
  return Response.json({ member: toView(next) });
}

export async function DELETE(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  const id = new URL(request.url).searchParams.get("id");
  const list = await listStaff(ctx.ws, true);
  if (!id || !list.some((m) => m.id === id)) return errorResponse("NOT_FOUND", "없는 직원입니다.", 404);
  try {
    await saveStaff(
      ctx.ws,
      list.filter((m) => m.id !== id),
    );
  } catch {
    return errorResponse("NO_STORE", "서버 저장소(KV)가 연결되지 않았습니다.", 503);
  }
  await audit(ctx.ws, ctx.session, "직원 삭제", list.find((m) => m.id === id)?.name ?? id);
  return Response.json({ ok: true });
}
