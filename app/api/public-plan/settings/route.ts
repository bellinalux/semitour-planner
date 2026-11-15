/** 고객 코스 만들기 관리자 설정 — GET(설정 + 통계) / PUT (관리자만) */
import { requireAdmin } from "@/lib/server/access";
import { getPublicSettings, getPublicStats, savePublicSettings } from "@/lib/server/publicPlan";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return Response.json({ settings: await getPublicSettings(), stats: await getPublicStats(), mail: !!process.env.RESEND_API_KEY?.trim(), turnstile: !!process.env.TURNSTILE_SECRET_KEY?.trim() });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json({ settings: await savePublicSettings(await request.json().catch(() => ({}))) });
  } catch {
    return Response.json({ error: { code: "NO_STORE", message: "서버 저장소가 없어 저장할 수 없습니다." } }, { status: 503 });
  }
}
