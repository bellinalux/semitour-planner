/** GET /api/public-plan/spots?dest=후쿠오카 — "꼭 가볼 곳" (한국인 인기 먼저, 가는 방법 계산용 도심 좌표 포함, AI 없음) */
import { mustSeeSpots } from "@/lib/server/publicPlan";

export async function GET(request: Request) {
  const dest = (new URL(request.url).searchParams.get("dest") ?? "").trim().slice(0, 60);
  if (!dest) return Response.json({ city: "", center: null, spots: [], source: "none" });
  const data = await mustSeeSpots(dest).catch(() => ({ city: dest, center: null, spots: [], source: "none" as const }));
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=600" } });
}
