/**
 * POST /api/engine/patterns { city, country, length: "half"|"day"|"multi", audience? }
 * 그 지역에서 잘 팔리는 투어들의 '코스 구조'(출발 시각·도는 순서·머무는 시간·꼭 넣는 곳)를 웹 검색으로 정리한다.
 * 문구·사진은 가져오지 않고 구조만. 7일 동안 저장해 다시 쓴다.
 */
import { z } from "zod";
import { engineGuard, engineOptions } from "@/lib/server/engineGuard";
import { generateGroundedText } from "@/lib/server/gemini";
import { getKv } from "@/lib/server/planStore";

export async function OPTIONS(request: Request) { return engineOptions(request); }

const reqSchema = z.object({
  city: z.string().min(1).max(120), country: z.string().max(80).default(""),
  length: z.enum(["half", "day", "multi"]).default("day"),
  audience: z.enum(["any", "couple", "family", "senior", "group"]).default("any"),
});
const LEN = { half: "반나절(3~5시간)", day: "하루(8~10시간)", multi: "1박 2일 이상" } as const;

export async function POST(request: Request) {
  const g = await engineGuard(request, true); if (g instanceof Response) return g;
  const parsed = reqSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "BAD_REQUEST", message: "지역 정보가 올바르지 않습니다." } }, { status: 400, headers: g.headers });
  const { city, country, length, audience } = parsed.data;
  const store = await getKv();
  const key = `pat:${city.toLowerCase().replace(/\s+/g, "")}:${length}:${audience}`;
  const cached = store ? await store.kv.get(key) : null;
  if (cached) return Response.json({ ...JSON.parse(cached), cached: true }, { headers: g.headers });

  const prompt = `여행 플랫폼(마이리얼트립·클룩·KKday·겟유어가이드·비아터 등)에서 ${[city, country].filter(Boolean).join(", ")}의 ${LEN[length]} 투어 중 후기가 많고 잘 팔리는 상품 5~10개를 웹 검색으로 찾아,
그 상품들의 '코스 구조'만 분석하라 (상품 문구·사진·가격은 쓰지 않는다).
JSON만 출력:
{"summary":"이 지역 인기 투어가 보통 어떻게 도는지 2~3문장","typicalStart":"HH:MM","typicalLengthHours":0,
"mustSee":[{"name":"한국어 이름","nameEn":"영문","why":"왜 빠지지 않는지 한 줄"}],
"routes":[{"title":"대표 동선 이름","order":["장소1","장소2"],"note":"동선 특징 한 줄"}],
"stayHints":[{"name":"장소","minutes":0}],
"tips":["전문가 운영 팁(시간대·예약·붐빔) 한 줄씩"]}
- mustSee 최대 8, routes 2~3개, stayHints 최대 10, tips 최대 6.${audience !== "any" ? `\n- 고객층: ${audience} 에게 맞는 점도 tips에 넣는다.` : ""}`;
  try {
    const r = await generateGroundedText({ user: prompt, temperature: 0.3, timeoutMs: 100_000 });
    const a = r.text.indexOf("{"), b = r.text.lastIndexOf("}");
    const data = JSON.parse(r.text.slice(a, b + 1));
    const out = { city, country, length, audience, ...data, sources: r.sources.slice(0, 12), searched: r.searched, at: new Date().toISOString() };
    if (store) await (store.kv as unknown as { put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void> }).put(key, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 7 });
    return Response.json(out, { headers: g.headers });
  } catch (e) {
    console.error("[engine/patterns]", e);
    return Response.json({ error: { code: "UPSTREAM", message: "인기 투어 동선을 정리하지 못했습니다. 잠시 뒤 다시 시도해 주세요." } }, { status: 502, headers: g.headers });
  }
}
