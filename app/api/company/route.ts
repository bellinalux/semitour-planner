import { normalizeCompany } from "@/lib/company";
import { isAuthed, workspaceId } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/external";
import { getKv } from "@/lib/server/planStore";

/**
 * 회사 정보(고객 문서의 법정 표시 항목). 접속 코드를 쓰는 사람들이 함께 보는 값이라
 * 일정 보관함과 같은 저장소에 작업공간별로 한 건만 둔다.
 *   GET /api/company   조회
 *   PUT /api/company   저장
 */
const MAX_BYTES = 32 * 1024;

async function open(request: Request) {
  const ws = await workspaceId();
  if (!ws) {
    return { error: errorResponse("CLOUD_DISABLED", "서버 저장은 접속 코드(APP_ACCESS_CODE)를 등록해야 쓸 수 있습니다.", 403) } as const;
  }
  if (!(await isAuthed(request))) {
    return { error: errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다. 화면을 새로고침해 접근 코드를 입력해 주세요.", 401) } as const;
  }
  const store = await getKv();
  if (!store) {
    return { error: errorResponse("NO_STORE", "서버 저장소(KV)가 아직 연결되지 않았습니다. 배포 설정을 확인해 주세요.", 503) } as const;
  }
  return { key: `company:${ws}`, kv: store.kv } as const;
}

export async function GET(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;
  try {
    const raw = await ctx.kv.get(ctx.key);
    return Response.json({ company: raw ? normalizeCompany(JSON.parse(raw)) : null });
  } catch (err) {
    console.error("[company:get]", err);
    return errorResponse("INTERNAL", "회사 정보를 읽는 중 오류가 발생했습니다.", 500);
  }
}

export async function PUT(request: Request) {
  const ctx = await open(request);
  if ("error" in ctx) return ctx.error;

  const text = await request.text();
  if (text.length > MAX_BYTES) return errorResponse("TOO_LARGE", "입력이 너무 깁니다.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const company = normalizeCompany((body as { company?: unknown })?.company);
  try {
    await ctx.kv.put(ctx.key, JSON.stringify(company));
    return Response.json({ company });
  } catch (err) {
    console.error("[company:put]", err);
    return errorResponse("INTERNAL", "회사 정보를 저장하는 중 오류가 발생했습니다.", 500);
  }
}
