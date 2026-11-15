/** GET /api/public-plan/recommend?dest=후쿠오카 — 기간별 추천 코스(지식 창고 인기 코스 묶음)와 고객들이 많이 고른 장소 */
import { popularPlaces, recommendedCourses } from "@/lib/server/publicPlan";

export async function GET(request: Request) {
  const dest = (new URL(request.url).searchParams.get("dest") ?? "").trim().slice(0, 60);
  if (!dest) return Response.json({ courses: [], popular: [] });
  const [courses, popular] = await Promise.all([recommendedCourses(dest).catch(() => []), popularPlaces(dest).catch(() => [])]);
  return Response.json({ courses, popular }, { headers: { "Cache-Control": "public, max-age=300" } });
}
