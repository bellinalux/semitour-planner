import { z } from "zod";
import { englishScriptSchema, scriptFromDraft, scriptKey, upsertScript } from "@/lib/guideBook";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { draftEnglish, draftPhrases, draftScript } from "@/lib/server/guideBookDraft";
import { getKit, updateKit } from "@/lib/server/guideBookStore";
import { getCity } from "@/lib/server/knowledgeStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("script"), city: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(80), area: z.string().trim().max(60).default(""), force: z.boolean().default(false) }),
  z.object({ kind: z.literal("phrases"), city: z.string().trim().min(1).max(60) }),
  /** 영어 원고 — 그 장소의 한국어 원고를 영어로 다시 쓴다 (검수 완료된 영어 원고는 force 없이는 덮지 않는다) */
  z.object({ kind: z.literal("english"), city: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(80), force: z.boolean().default(false) }),
]);

/**
 * POST /api/guidebook/draft — AI 초안 (웹 검색 근거)
 *  script: 장소 설명 원고. 검수 완료된 원고는 force 없이는 덮지 않는다 (그대로 돌려준다)
 *  phrases: 도시 현지 회화 카드
 */
export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "도시·장소 이름을 확인해 주세요.", 400);
  const o = parsed.data;
  try {
    if (o.kind === "phrases") {
      const r = await draftPhrases(o.city);
      const phrases = r.phrases.slice(0, 30).map((p) => ({ ko: p.ko.slice(0, 80), local: p.local.slice(0, 120), say: p.say.slice(0, 120) }));
      const kit = await updateKit(o.city, (k) => ({ ...k, phrases, updatedAt: new Date().toISOString() }));
      return Response.json({ kit, language: r.language });
    }
    if (o.kind === "english") {
      const kit0 = await getKit(o.city);
      const base = kit0.scripts.find((s) => s.key === scriptKey(o.name));
      if (!base) return errorResponse("NOT_FOUND", "한국어 원고를 먼저 만들어 주세요.", 404);
      if (base.en?.status === "reviewed" && !o.force) return Response.json({ kit: kit0, kept: true });
      const d = await draftEnglish(base);
      const now = new Date().toISOString();
      const en = englishScriptSchema.parse({
        intro: d.intro.slice(0, 700),
        points: d.points.slice(0, 8).map((p) => ({ title: p.title.slice(0, 160), text: p.text.slice(0, 2000), more: p.more.slice(0, 2000) })),
        site: { dropOff: d.site.dropOff.slice(0, 400), tickets: d.site.tickets.slice(0, 400), meetPoint: d.site.meetPoint.slice(0, 400), restroom: d.site.restroom.slice(0, 400), photo: d.site.photo.slice(0, 400) },
        cautions: d.cautions.slice(0, 8).map((c) => c.slice(0, 400)),
        faq: d.faq.slice(0, 8).map((f) => ({ q: f.q.slice(0, 300), a: f.a.slice(0, 800) })),
        audience: { family: d.audience.family.slice(0, 400), senior: d.audience.senior.slice(0, 400), student: d.audience.student.slice(0, 400), couple: d.audience.couple.slice(0, 400) },
        mustKnow: d.mustKnow.slice(0, 5).map((m) => m.slice(0, 300)),
        status: "draft",
        updatedAt: now,
      });
      if (!en.intro.trim() && en.points.every((p) => !p.text.trim())) return errorResponse("BAD_OUTPUT", "영어 원고를 만들지 못했습니다. 다시 시도해 주세요.", 502);
      const kit = await updateKit(o.city, (k) => ({ ...k, scripts: k.scripts.map((s) => (s.key === base.key ? { ...s, en } : s)), updatedAt: now }));
      return Response.json({ kit });
    }
    const cur = (await getKit(o.city)).scripts.find((s) => s.key === scriptKey(o.name));
    if (cur?.status === "reviewed" && !o.force) return Response.json({ kit: await getKit(o.city), kept: true });
    const knowledge = await getCity(o.city).catch(() => null);
    const place = knowledge?.places.find((p) => p.key === scriptKey(o.name)) ?? null;
    const r = await draftScript({ city: o.city, name: o.name, area: o.area || place?.area, place });
    const script = scriptFromDraft(o.city, o.name, r.draft, r.sources, o.area || place?.area || "");
    // 빈 원고는 저장하지 않는다 (장소를 찾지 못했거나 응답이 비었을 때)
    if (!script.intro.trim() && script.points.every((p) => !p.text.trim())) {
      return errorResponse("NOT_FOUND", `${o.name}에 대한 자료를 찾지 못해 원고를 만들지 못했습니다. 장소 이름을 정확히(현지 이름 병기) 적어 다시 시도해 주세요.`, 422);
    }
    const kit = await updateKit(o.city, (k) => upsertScript(k, script, o.force).kit);
    return Response.json({ kit, searched: r.searched });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[guidebook/draft]", err);
    return errorResponse("INTERNAL", "원고를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 500);
  }
}
