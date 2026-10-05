/**
 * 장소 지식 창고
 *  GET  /api/engine/knowledge?city=로마&names=콜로세움|판테온  → { knowledge: { 이름: 정보 } }
 *  POST /api/engine/knowledge  { name, city, open?, lastEntry?, typicalStayMin?, best?, reservation?, tips? }
 *       → 사람이 고친 정보(source:'manual')로 저장 — 자동으로 찾은 정보보다 우선하고 기한 없이 남는다
 */
import { z } from "zod";
import { engineGuard, engineOptions } from "@/lib/server/engineGuard";
import { getKnowledge, putKnowledge } from "@/lib/server/courseEngineServer";

export async function OPTIONS(request: Request) { return engineOptions(request); }

export async function GET(request: Request) {
  const g = await engineGuard(request, false); if (g instanceof Response) return g;
  const q = new URL(request.url).searchParams;
  const names = (q.get("names") ?? "").split("|").map(s => s.trim()).filter(Boolean).slice(0, 30);
  return Response.json({ knowledge: await getKnowledge(names, q.get("city") ?? "") }, { headers: g.headers });
}

const manualSchema = z.object({
  name: z.string().min(1).max(200), city: z.string().max(120).default(""),
  open: z.record(z.string(), z.string().max(60)).optional(),
  lastEntry: z.string().max(10).optional(), typicalStayMin: z.number().int().min(0).max(720).optional(),
  best: z.enum(["morning", "afternoon", "sunset", "night", ""]).optional(),
  reservation: z.string().max(300).optional(), tips: z.array(z.string().max(200)).max(8).optional(),
  address: z.string().max(300).optional(), lat: z.number().optional(), lng: z.number().optional(),
});

export async function POST(request: Request) {
  const g = await engineGuard(request, false); if (g instanceof Response) return g;
  const parsed = manualSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "BAD_REQUEST", message: "장소 정보가 올바르지 않습니다." } }, { status: 400, headers: g.headers });
  const prev = (await getKnowledge([parsed.data.name], parsed.data.city))[parsed.data.name];
  const merged = { ...(prev ?? {}), ...parsed.data, source: "manual" as const, updatedAt: new Date().toISOString() };
  await putKnowledge(merged as Parameters<typeof putKnowledge>[0]);
  return Response.json({ ok: true, knowledge: merged }, { headers: g.headers });
}
