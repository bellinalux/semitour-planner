import { isAuthed } from "@/lib/server/access";
import { holidays } from "@/lib/server/courseEngineServer";
import { errorResponse } from "@/lib/server/external";

/** GET /api/holidays?country=한국&year=2026 → 그 나라 공휴일 (공개 데이터 Nager.Date, 서버가 30일 보관). AI를 쓰지 않는다 */
export async function GET(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const url = new URL(request.url);
  const country = (url.searchParams.get("country") ?? "한국").slice(0, 20);
  const year = Number(url.searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return errorResponse("BAD_REQUEST", "연도를 확인해 주세요.", 400);
  return Response.json({ holidays: await holidays(country, year) });
}
