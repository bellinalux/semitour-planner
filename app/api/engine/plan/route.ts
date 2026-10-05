/**
 * POST /api/engine/plan — 코스 엔진: 장소 정보 채우기(장소 지식·구글 지도) → 날짜(요일·공휴일·일몰) → 이동 시간표 →
 * 지금 순서와 엔진 추천 순서를 계산하고 품질 점수를 매긴다. 세미투어 화면과 상세페이지 스튜디오가 같이 쓴다.
 */
import { engineGuard, engineOptions } from "@/lib/server/engineGuard";
import { planCourse, planRequestSchema } from "@/lib/server/courseEngineServer";

export async function OPTIONS(request: Request) { return engineOptions(request); }

export async function POST(request: Request) {
  const g = await engineGuard(request, true); if (g instanceof Response) return g;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: { code: "BAD_REQUEST", message: "요청 형식이 올바르지 않습니다." } }, { status: 400, headers: g.headers }); }
  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[engine/plan] 요청 검증 실패:", parsed.error.issues.slice(0, 3).map(i => `${i.path.join(".")}: ${i.message}`));
    return Response.json({ error: { code: "BAD_REQUEST", message: "코스 정보가 올바르지 않습니다." } }, { status: 400, headers: g.headers });
  }
  try {
    return Response.json(await planCourse(parsed.data), { headers: g.headers });
  } catch (e) {
    console.error("[engine/plan]", e);
    return Response.json({ error: { code: "INTERNAL", message: e instanceof Error ? e.message : "코스 엔진 오류" } }, { status: 500, headers: g.headers });
  }
}
