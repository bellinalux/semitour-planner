/**
 * POST /api/place-cart — 장소 담기 → 자동 배치.
 * 담은 장소를 코스 엔진으로 찾아(좌표·영업시간·보통 체류) 날짜별로 나누고, 날마다 점심을 넣어 순서·시각을 정한다.
 */
import { z } from "zod";
import { splitIntoDays, timelineToDay, type CartPlace } from "@/lib/placeCart";
import { planCourse } from "@/lib/server/courseEngineServer";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { withAiInfo } from "@/lib/server/aiProviders";

const schema = z.object({
  places: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  city: z.string().trim().max(120).default(""),
  country: z.string().trim().max(80).default(""),
  days: z.number().int().min(1).max(10),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start: z.string().regex(/^\d{1,2}:\d{2}$/).default("09:00"),
  mode: z.enum(["car", "walk", "public"]).default("car"),
});

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function handlePost(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "장소를 확인해 주세요.", 400);
  const req = parsed.data;
  try {
    // 1) 장소 찾기 (좌표·영업시간·보통 체류) — 순서는 아직 정하지 않는다
    const names = [...new Set(req.places)];
    const probe = await planCourse({
      places: names.map((name, i) => ({ id: `p${i}`, name, stayMin: 0 })),
      city: req.city, country: req.country, start: req.start, mode: req.mode, audience: "group", reorder: false, lookup: true,
    });
    const cart: CartPlace[] = probe.places.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, stayMin: p.stayMin || 60 }));
    // 2) 날짜별로 나누고 3) 날마다 점심을 넣어 엔진이 순서·시각을 정한다
    const groups = splitIntoDays(cart, req.days);
    const dropped: { name: string; reason: string }[] = [];
    const days = await Promise.all(
      groups.map(async (g, k) => {
        const lunch = { id: `lunch${k}`, name: "점심 식사 (현지식)", stayMin: 60, kind: "meal" as const, meal: "lunch" as const };
        const plan = await planCourse({
          places: [...g.map((p) => ({ id: p.id, name: p.name, stayMin: p.stayMin, ...(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : {}) })), lunch],
          city: req.city, country: req.country, start: req.start, mode: req.mode, audience: "group", reorder: true, lookup: false,
          ...(req.date ? { date: addDays(req.date, k) } : {}),
        });
        dropped.push(...plan.best.dropped.map((d) => ({ name: d.name, reason: d.reason })));
        const byId = new Map<string, CartPlace & { meal?: boolean }>([...g.map((p) => [p.id, p] as const), [lunch.id, { ...lunch, meal: true }]]);
        return timelineToDay(k + 1, req.city, req.start, plan.best.timeline, byId);
      }),
    );
    return Response.json({ days, dropped, matrix: probe.context.matrix });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[place-cart]", err);
    return errorResponse("INTERNAL", "장소를 배치하지 못했습니다.", 500);
  }
}

export const POST = withAiInfo(handlePost);
