import { z } from "zod";
import { englishScriptSchema, scriptFromDraft, scriptKey, upsertScript } from "@/lib/guideBook";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { deepenStop, draftEnglish, draftPhrases, draftScript } from "@/lib/server/guideBookDraft";
import { getKit, updateKit } from "@/lib/server/guideBookStore";
import { getCity } from "@/lib/server/knowledgeStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const city = z.string().trim().min(1).max(60);
const name = z.string().trim().min(1).max(80);
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("script"), city, name, area: z.string().trim().max(60).default(""), force: z.boolean().default(false), tier: z.enum(["major", "standard", "brief"]).optional() }),
  z.object({ kind: z.literal("phrases"), city }),
  /** 영어 원고 — 그 장소의 한국어 원고를 영어로 다시 쓴다 (검수 완료된 영어 원고는 force 없이는 덮지 않는다) */
  z.object({ kind: z.literal("english"), city, name, force: z.boolean().default(false) }),
  /** 지점 한 곳 더 깊게 (한국어 원고) */
  z.object({ kind: z.literal("deepen"), city, name, index: z.number().int().min(0).max(9) }),
]);

const clip = (s: string, n: number) => (s ?? "").trim().slice(0, n);
const stopFrom = (d: { title: string; hook: string; look: string; story: string; meaning: string; korea: string; question: string; transition: string; more: string }) => ({
  title: clip(d.title, 160),
  hook: clip(d.hook, 800),
  look: clip(d.look, 1500),
  text: clip(d.story, 5000),
  meaning: clip(d.meaning, 2500),
  korea: clip(d.korea, 1000),
  question: clip(d.question, 600),
  transition: clip(d.transition, 600),
  more: clip(d.more, 4000),
});

/**
 * POST /api/guidebook/draft — AI 초안 (웹 검색 근거)
 *  script: 장소 설명 원고 (지점별 전문 해설 + 사실 확인). 검수 완료된 원고는 force 없이는 덮지 않는다. 베테랑 메모·등급은 이어서
 *  english: 영어 원고 / deepen: 지점 한 곳 더 깊게 / phrases: 도시 현지 회화 카드
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

    const kit0 = await getKit(o.city);
    const cur = kit0.scripts.find((s) => s.key === scriptKey(o.name));

    if (o.kind === "deepen") {
      if (!cur || !cur.points[o.index]) return errorResponse("NOT_FOUND", "원고의 그 지점을 찾지 못했습니다.", 404);
      const stop = stopFrom(await deepenStop(cur, o.index));
      if (!stop.text) return errorResponse("BAD_OUTPUT", "지점을 다시 쓰지 못했습니다. 다시 시도해 주세요.", 502);
      if (!stop.title) stop.title = cur.points[o.index].title;
      const now = new Date().toISOString();
      const kit = await updateKit(o.city, (k) => ({
        ...k,
        // 고친 지점은 다시 검수 (영어 원고도)
        scripts: k.scripts.map((s) => (s.key === cur.key ? { ...s, points: s.points.map((p, i) => (i === o.index ? stop : p)), status: "draft" as const, updatedAt: now, ...(s.en ? { en: { ...s.en, status: "draft" as const } } : {}) } : s)),
        updatedAt: now,
      }));
      return Response.json({ kit });
    }

    if (o.kind === "english") {
      if (!cur) return errorResponse("NOT_FOUND", "한국어 원고를 먼저 만들어 주세요.", 404);
      if (cur.en?.status === "reviewed" && !o.force) return Response.json({ kit: kit0, kept: true });
      const d = await draftEnglish(cur);
      const now = new Date().toISOString();
      const en = englishScriptSchema.parse({
        intro: clip(d.intro, 1500),
        points: d.stops.slice(0, 10).map(stopFrom),
        site: { dropOff: clip(d.site.dropOff, 400), tickets: clip(d.site.tickets, 400), meetPoint: clip(d.site.meetPoint, 400), restroom: clip(d.site.restroom, 400), photo: clip(d.site.photo, 400) },
        cautions: d.cautions.slice(0, 8).map((c) => clip(c, 400)),
        faq: d.faq.slice(0, 8).map((f) => ({ q: clip(f.q, 300), a: clip(f.a, 1000) })),
        audience: { family: clip(d.audience.family, 600), senior: clip(d.audience.senior, 600), student: clip(d.audience.student, 600), couple: clip(d.audience.couple, 600) },
        mustKnow: d.mustKnow.slice(0, 5).map((m) => clip(m, 300)),
        status: "draft",
        updatedAt: now,
      });
      if (!en.intro.trim() && en.points.every((p) => !p.text.trim())) return errorResponse("BAD_OUTPUT", "영어 원고를 만들지 못했습니다. 다시 시도해 주세요.", 502);
      const kit = await updateKit(o.city, (k) => ({ ...k, scripts: k.scripts.map((s) => (s.key === cur.key ? { ...s, en } : s)), updatedAt: now }));
      return Response.json({ kit });
    }

    if (cur?.status === "reviewed" && !o.force) return Response.json({ kit: kit0, kept: true });
    const knowledge = await getCity(o.city).catch(() => null);
    const place = knowledge?.places.find((p) => p.key === scriptKey(o.name)) ?? null;
    // 회사 말투 예시: 검수 완료된 새 방식 원고 (이 장소 말고, 가장 최근)
    const example = [...kit0.scripts].filter((s) => s.key !== scriptKey(o.name) && s.status === "reviewed" && s.version >= 2).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    const r = await draftScript({ city: o.city, name: o.name, area: o.area || place?.area, place, tier: o.tier ?? (cur && cur.version >= 2 ? cur.tier : undefined), veteran: cur?.veteran, example });
    const script = scriptFromDraft(o.city, o.name, r.draft, r.sources, o.area || cur?.area || place?.area || "", { veteran: cur?.veteran, checks: r.checks });
    // 빈 원고는 저장하지 않는다 (장소를 찾지 못했거나 응답이 비었을 때)
    if (!script.intro.trim() && script.points.every((p) => !p.text.trim())) {
      return errorResponse("NOT_FOUND", `${o.name}에 대한 자료를 찾지 못해 원고를 만들지 못했습니다. 장소 이름을 정확히(현지 이름 병기) 적어 다시 시도해 주세요.`, 422);
    }
    const kit = await updateKit(o.city, (k) => upsertScript(k, script, o.force).kit);
    return Response.json({ kit, searched: r.searched });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[guidebook/draft]", err);
    return errorResponse("INTERNAL", err instanceof Error && err.message.includes("조사") ? err.message : "원고를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 500);
  }
}
