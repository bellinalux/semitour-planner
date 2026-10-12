import { z } from "zod";
import { scriptFromDraft, scriptKey, upsertScript } from "@/lib/guideBook";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { draftPhrases, draftScript } from "@/lib/server/guideBookDraft";
import { getKit, updateKit } from "@/lib/server/guideBookStore";
import { getCity } from "@/lib/server/knowledgeStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("script"), city: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(80), area: z.string().trim().max(60).default(""), force: z.boolean().default(false) }),
  z.object({ kind: z.literal("phrases"), city: z.string().trim().min(1).max(60) }),
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
