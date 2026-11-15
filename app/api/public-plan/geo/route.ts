/** GET /api/public-plan/geo?q=유후인 — 도시 좌표 (무료 OpenStreetMap, 90일 저장) — 도시 루트 지도·도시 사이 교통 비교용 */
import { geocode } from "@/lib/server/freeData";
import { memoryAllow, clientKey } from "@/lib/server/rateLimit";

export async function GET(request: Request) {
  if (!memoryAllow(`geo:${clientKey(request)}`, 30)) return Response.json({ error: { code: "RATE_LIMITED", message: "잠시 뒤에 다시 시도해 주세요." } }, { status: 429 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (!q) return Response.json({ hit: null });
  const hit = await geocode(q).catch(() => null);
  return Response.json({ hit: hit ? { lat: hit.lat, lng: hit.lng, name: hit.name } : null }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
