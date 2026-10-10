import { z } from "zod";
import { COMPANION_IDS, knowledgeKey, MAX_PLACES } from "@/lib/knowledge";
import { isAuthed } from "@/lib/server/access";
import { bumpMetric, deleteCity, getCity, getMetrics, listCities, updateCity } from "@/lib/server/knowledgeStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/** GET /api/knowledge — 도시 목록, ?city=다낭 — 그 도시 지식 (직원만) */
export async function GET(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const params = new URL(request.url).searchParams;
  if (params.get("metrics")) return Response.json({ metrics: await getMetrics() });
  const city = params.get("city")?.trim() ?? "";
  if (!city) return Response.json({ cities: await listCities() });
  return Response.json({ doc: await getCity(city.slice(0, 60)) });
}

const str = (n: number) => z.string().trim().max(n);
const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), city: str(60), key: str(80), verified: z.boolean() }),
  /** 검수 — 확인하고 그대로 쓰기 (잠그지 않음). all이면 대기 중인 곳 모두 */
  z.object({ action: z.literal("review"), city: str(60), key: str(80).default(""), all: z.boolean().default(false) }),
  /** 검수 — 대기 중인 곳 모두 지우기 */
  z.object({ action: z.literal("rejectPending"), city: str(60) }),
  z.object({
    action: z.literal("edit"),
    city: str(60),
    key: str(80),
    patch: z
      .object({
        name: str(80).min(1),
        area: str(40),
        stayWeb: z.number().int().min(0).max(720),
        likes: z.array(str(120)).max(5),
        dislikes: z.array(str(120)).max(5),
        tips: z.array(str(120)).max(5),
        fits: z.array(z.enum(COMPANION_IDS)).max(6),
      })
      .partial(),
  }),
  z.object({ action: z.literal("add"), city: str(60), name: str(80).min(1), area: str(40).default(""), stayWeb: z.number().int().min(0).max(720).default(0) }),
  z.object({ action: z.literal("remove"), city: str(60), key: str(80) }),
  z.object({ action: z.literal("removeCourse"), city: str(60), key: str(160) }),
  z.object({ action: z.literal("deleteCity"), city: str(60) }),
]);

const metricSchema = z.object({ score: z.number().min(0).max(100) });

/** 코스 점검 점수 기록 (발전 지표) */
export async function POST(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const parsed = metricSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "내용을 확인해 주세요.", 400);
  await bumpMetric({ score: parsed.data.score });
  return Response.json({ ok: true });
}

/** 직원이 고치기 — 확인(잠금)·내용 고치기·직접 추가·지우기 */
export async function PATCH(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "내용을 확인해 주세요.", 400);
  const a = parsed.data;
  if (a.action === "deleteCity") {
    await deleteCity(a.city);
    return Response.json({ cities: await listCities() });
  }
  const now = new Date().toISOString();
  const doc = await updateCity(a.city, (d) => {
    switch (a.action) {
      case "verify":
        return { ...d, places: d.places.map((p) => (p.key === a.key ? { ...p, verified: a.verified, pending: false, updatedAt: now } : p)), updatedAt: now };
      case "review":
        return { ...d, places: d.places.map((p) => (a.all || p.key === a.key ? { ...p, pending: false } : p)), updatedAt: now };
      case "rejectPending":
        return { ...d, places: d.places.filter((p) => !p.pending), updatedAt: now };
      case "edit":
        return {
          ...d,
          places: d.places.map((p) => (p.key === a.key ? { ...p, ...a.patch, ...(a.patch.name ? { key: knowledgeKey(a.patch.name) || p.key } : {}), verified: true, pending: false, updatedAt: now } : p)),
          updatedAt: now,
        };
      case "add": {
        const key = knowledgeKey(a.name);
        if (!key || d.places.some((p) => p.key === key)) return d;
        const card = { key, name: a.name, area: a.area, kind: "sight" as const, popularity: 0, seen: 0, agencies: [], fits: [], likes: [], dislikes: [], tips: [], stayWeb: a.stayWeb, fieldNotes: [], sources: [], verified: true, updatedAt: now };
        return { ...d, places: [card, ...d.places].slice(0, MAX_PLACES), updatedAt: now };
      }
      case "remove":
        return { ...d, places: d.places.filter((p) => p.key !== a.key), updatedAt: now };
      case "removeCourse":
        return { ...d, courses: d.courses.filter((c) => c.key !== a.key), updatedAt: now };
    }
  });
  return Response.json({ doc });
}
