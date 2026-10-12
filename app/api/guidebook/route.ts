import { z } from "zod";
import { basicsSchema, guideScriptSchema, kitFileSchema, mergeKit, phraseSchema, scriptKey, upsertScript } from "@/lib/guideBook";
import { getSession } from "@/lib/server/access";
import { getBasics, getKit, hasStore, listKits, putBasics, updateKit } from "@/lib/server/guideBookStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * GET /api/guidebook — 도시 목록 + 교육 자료, ?city=방콕 — 그 도시 해설집, ?cities=방콕,파타야 — 여러 도시 해설집 (직원만)
 */
export async function GET(request: Request) {
  if (!(await getSession(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const params = new URL(request.url).searchParams;
  const city = params.get("city")?.trim() ?? "";
  if (city) return Response.json({ kit: await getKit(city.slice(0, 60)) });
  const many = (params.get("cities") ?? "")
    .split(",")
    .map((c) => c.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 10);
  if (many.length > 0) return Response.json({ kits: await Promise.all(many.map((c) => getKit(c))), basics: await getBasics() });
  return Response.json({ cities: await listKits(), basics: await getBasics() });
}

const str = (n: number) => z.string().trim().max(n);
const patchSchema = z.discriminatedUnion("action", [
  /** 원고 저장 (직원이 고친 것) — 이름이 바뀌면 열쇠도 바뀐다 */
  z.object({ action: z.literal("save"), city: str(60).min(1), prevKey: str(80).default(""), script: guideScriptSchema }),
  /** 검수 완료·풀기 */
  z.object({ action: z.literal("review"), city: str(60).min(1), key: str(80), reviewed: z.boolean() }),
  z.object({ action: z.literal("remove"), city: str(60).min(1), key: str(80) }),
  z.object({ action: z.literal("phrases"), city: str(60).min(1), phrases: z.array(phraseSchema).max(60) }),
  z.object({ action: z.literal("basics"), basics: basicsSchema }),
  /** 파일로 불러오기 (내보낸 해설집) */
  z.object({ action: z.literal("import"), file: kitFileSchema }),
]);

/** 직원이 고치기 — 원고 저장·검수·지우기, 현지 회화, 교육 자료, 파일 불러오기 */
export async function PATCH(request: Request) {
  const session = await getSession(request);
  if (!session) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  if (!(await hasStore())) return errorResponse("NO_STORE", "서버 저장소가 연결되지 않아 저장할 수 없습니다.", 503);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "내용을 확인해 주세요.", 400);
  const a = parsed.data;
  const now = new Date().toISOString();
  const by = session.name || "직원";

  if (a.action === "basics") {
    const basics = { sections: a.basics.sections, updatedAt: now, updatedBy: by };
    await putBasics(basics);
    return Response.json({ basics });
  }
  if (a.action === "import") {
    let result = { added: 0, updated: 0, skipped: 0 };
    const kit = await updateKit(a.file.city, (cur) => {
      const m = mergeKit(cur, { scripts: a.file.scripts, phrases: a.file.phrases });
      result = { added: m.added, updated: m.updated, skipped: m.skipped };
      return m.added + m.updated > 0 || (cur.phrases.length === 0 && m.kit.phrases.length > 0) ? m.kit : cur;
    });
    return Response.json({ kit, ...result });
  }

  const kit = await updateKit(a.city, (k) => {
    switch (a.action) {
      case "save": {
        const key = scriptKey(a.script.name);
        if (!key) return k;
        const script = { ...a.script, key, city: k.city, updatedAt: now, updatedBy: by };
        const rest = a.prevKey && a.prevKey !== key ? { ...k, scripts: k.scripts.filter((s) => s.key !== a.prevKey) } : k;
        return upsertScript(rest, script, true).kit;
      }
      case "review":
        return { ...k, scripts: k.scripts.map((s) => (s.key === a.key ? { ...s, status: a.reviewed ? ("reviewed" as const) : ("draft" as const), updatedAt: now, updatedBy: by } : s)), updatedAt: now };
      case "remove":
        return { ...k, scripts: k.scripts.filter((s) => s.key !== a.key), updatedAt: now };
      case "phrases":
        return { ...k, phrases: a.phrases, updatedAt: now };
    }
  });
  return Response.json({ kit });
}
