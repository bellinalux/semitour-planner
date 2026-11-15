/** GET /api/public-plan/config — 고객 화면 설정 (회사 이름·로고·색·연락처, 안내 문구, 경비 표시, 사람 확인 키) */
import { normalizeCompany } from "@/lib/company";
import { workspaceId } from "@/lib/server/access";
import { getKv } from "@/lib/server/planStore";
import { getPublicSettings, turnstileSiteKey } from "@/lib/server/publicPlan";

export async function GET() {
  const settings = await getPublicSettings();
  let company = { name: "", logo: "", color: "", phone: "", email: "" };
  const ws = await workspaceId();
  const s = await getKv();
  if (ws && s) {
    try {
      const raw = await s.kv.get(`company:${ws}`);
      if (raw) {
        const c = normalizeCompany(JSON.parse(raw));
        company = { name: c.name, logo: c.logo, color: c.docColor, phone: c.phone, email: c.email };
      }
    } catch {
      // 회사 정보 없이 기본 모양
    }
  }
  return Response.json(
    {
      enabled: settings.enabled,
      notice: settings.notice,
      showPrice: settings.showPrice,
      priceTable: settings.showPrice ? settings.priceTable : [],
      turnstileSiteKey: turnstileSiteKey(),
      company,
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
