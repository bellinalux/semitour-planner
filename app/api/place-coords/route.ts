import { z } from "zod";
import { locatePlaces } from "@/lib/server/courseEngineServer";
import { guardRequest } from "@/lib/server/guard";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const schema = z.object({
  city: z.string().trim().min(1).max(60),
  country: z.string().trim().max(60).default(""),
  names: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
});

/** 숙소 등 이름으로 좌표 찾기 (구글 지도, 한 번 찾은 곳은 저장) — 코스 지도의 동선 출발·도착점 */
export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "이름을 확인해 주세요.", 400);
  try {
    return Response.json({ places: await locatePlaces(parsed.data.names, parsed.data.city, parsed.data.country) });
  } catch (err) {
    console.error("[place-coords]", err);
    return errorResponse("INTERNAL", "위치를 찾지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 500);
  }
}
