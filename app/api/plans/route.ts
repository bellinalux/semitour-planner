import { isAuthed, workspaceId } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/external";
import {
  getKv,
  getPlan,
  listPlans,
  MAX_CLOUD_PLANS,
  MAX_PLAN_BYTES,
  PLAN_ID_PATTERN,
  planExists,
  putPlan,
  removePlan,
} from "@/lib/server/planStore";
import { MAX_NAME_LENGTH, parseSnapshot, type SavedPlan } from "@/lib/workspace";

/**
 * 서버 저장(일정 보관함). 접근 코드가 켜져 있어야 하고, 같은 코드를 쓰는 사람끼리 하나의 보관함을 공유한다.
 *  GET    /api/plans          목록
 *  GET    /api/plans?id=...   한 건 (일정 전체)
 *  PUT    /api/plans          저장 { id, name, snapshot }
 *  DELETE /api/plans?id=...   삭제
 */

async function open(request: Request) {
  const ws = await workspaceId();
  if (!ws) {
    return {
      error: errorResponse("CLOUD_DISABLED", "서버 저장은 접속 코드(APP_ACCESS_CODE)를 등록해야 쓸 수 있습니다.", 403),
    } as const;
  }
  if (!(await isAuthed(request))) {
    return { error: errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다. 화면을 새로고침해 접근 코드를 입력해 주세요.", 401) } as const;
  }
  const store = await getKv();
  if (!store) {
    return { error: errorResponse("NO_STORE", "서버 저장소(KV)가 아직 연결되지 않았습니다. 배포 설정을 확인해 주세요.", 503) } as const;
  }
  return { ws, kv: store.kv, kind: store.kind } as const;
}

export async function GET(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (id === null) return Response.json({ plans: await listPlans(ctx.kv, ctx.ws), storage: ctx.kind, max: MAX_CLOUD_PLANS });
    if (!PLAN_ID_PATTERN.test(id)) return errorResponse("BAD_REQUEST", "저장 번호 형식이 올바르지 않습니다.", 400);
    const plan = await getPlan(ctx.kv, ctx.ws, id);
    return plan ? Response.json({ plan }) : errorResponse("NOT_FOUND", "저장된 일정을 찾지 못했습니다. 삭제되었을 수 있어요.", 404);
  } catch (err) {
    console.error("[plans:get]", err);
    return errorResponse("INTERNAL", "서버 저장소를 읽는 중 오류가 발생했습니다.", 500);
  }
}

export async function PUT(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;

  const text = await request.text();
  if (text.length > MAX_PLAN_BYTES) return errorResponse("TOO_LARGE", "일정이 너무 커서 저장할 수 없습니다 (2MB 이하).", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : "";
  const name = typeof b.name === "string" ? b.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  const snapshot = parseSnapshot(b.snapshot);
  if (!PLAN_ID_PATTERN.test(id)) return errorResponse("BAD_REQUEST", "저장 번호 형식이 올바르지 않습니다.", 400);
  if (!name) return errorResponse("BAD_REQUEST", "저장 이름을 입력해 주세요.", 400);
  if (!snapshot) return errorResponse("BAD_REQUEST", "일정 데이터 형식이 올바르지 않습니다.", 400);

  try {
    if (!(await planExists(ctx.kv, ctx.ws, id))) {
      const count = (await listPlans(ctx.kv, ctx.ws)).length;
      if (count >= MAX_CLOUD_PLANS) {
        return errorResponse("LIMIT", `서버 저장은 최대 ${MAX_CLOUD_PLANS}개까지 가능합니다. 안 쓰는 일정을 삭제해 주세요.`, 409);
      }
    }
    const plan: SavedPlan = { id, name, savedAt: new Date().toISOString(), snapshot };
    return Response.json({ entry: await putPlan(ctx.kv, ctx.ws, plan) });
  } catch (err) {
    console.error("[plans:put]", err);
    return errorResponse("INTERNAL", "서버에 저장하는 중 오류가 발생했습니다.", 500);
  }
}

export async function DELETE(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!PLAN_ID_PATTERN.test(id)) return errorResponse("BAD_REQUEST", "저장 번호 형식이 올바르지 않습니다.", 400);
  try {
    await removePlan(ctx.kv, ctx.ws, id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[plans:delete]", err);
    return errorResponse("INTERNAL", "삭제하는 중 오류가 발생했습니다.", 500);
  }
}
