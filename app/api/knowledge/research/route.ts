import { z } from "zod";
import { COMPANION_IDS, isStale, mergeResearch } from "@/lib/knowledge";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { researchCity } from "@/lib/server/knowledgeResearch";
import { bumpMetric, getCity, putCity } from "@/lib/server/knowledgeStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const schema = z.object({
  city: z.string().trim().min(1).max(60),
  travelType: z.enum(["semi", "package", "honeymoon", "senior", "accessible"]).default("semi"),
  tripScope: z.enum(["domestic", "overseas"]).default("overseas"),
  companions: z.array(z.enum(COMPANION_IDS)).max(6).default([]),
  /** true면 조사한 지 30일이 안 됐어도 다시 조사 */
  force: z.boolean().default(false),
});

/** 도시 조사 → 지식 창고에 합치기 (AI·웹 검색). 30일 안에 조사했으면 저장된 것을 돌려준다 */
export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "도시 이름을 확인해 주세요.", 400);
  const o = parsed.data;
  const cur = await getCity(o.city);
  if (!o.force && !isStale(cur)) return Response.json({ doc: cur, researched: false });
  try {
    const r = await researchCity(o);
    const doc = mergeResearch(cur, r.result, r.sources);
    await putCity(doc);
    await bumpMetric({ research: 1 });
    return Response.json({ doc, researched: r.searched });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[knowledge/research]", err);
    return errorResponse("INTERNAL", "조사하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 500);
  }
}
