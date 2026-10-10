import { z } from "zod";
import { isAuthed } from "@/lib/server/access";
import { cached, DAY } from "@/lib/server/aiCache";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const schema = z.object({
  city: z.string().trim().max(60).default(""),
  names: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
});

const UA = "semitour-planner/1.0 (travel itinerary tool)";
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

interface Photo {
  name: string;
  url: string;
  credit: string;
}

/** 위키백과(한국어→영어) 대표 사진 → 위키미디어 공용 라이선스 확인 (공용에 없는 비자유 이미지는 쓰지 않는다) */
async function findPhoto(name: string, city: string): Promise<Photo | null> {
  for (const [lang, q] of [
    ["ko", `${name} ${city}`.trim()],
    ["ko", name],
    ["en", `${name} ${city}`.trim()],
  ] as const) {
    const u = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=1&prop=pageimages&piprop=thumbnail|name&pithumbsize=800`;
    const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!r?.ok) continue;
    const j = (await r.json().catch(() => null)) as { query?: { pages?: Record<string, { thumbnail?: { source: string }; pageimage?: string }> } } | null;
    const page = Object.values(j?.query?.pages ?? {})[0];
    if (!page?.thumbnail?.source || !page.pageimage) continue;
    // 라이선스: 위키미디어 공용 파일만 (공용에 없으면 그 위키에만 올린 비자유 이미지라 쓰지 않는다)
    const m = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(`File:${page.pageimage}`)}&prop=imageinfo&iiprop=extmetadata`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    const mj = m?.ok ? ((await m.json().catch(() => null)) as { query?: { pages?: Record<string, { missing?: string; imageinfo?: { extmetadata?: Record<string, { value: string }> }[] }> } } | null) : null;
    const info = Object.values(mj?.query?.pages ?? {})[0];
    const meta = info && !("missing" in info) ? info.imageinfo?.[0]?.extmetadata : undefined;
    const license = meta?.LicenseShortName?.value ?? "";
    if (!meta || !license || /fair use|non-free/i.test(license)) continue;
    const artist = strip(meta.Artist?.value ?? "") || "작자 미상";
    return { name, url: page.thumbnail.source, credit: `사진: ${artist} · ${license} · 위키미디어 공용` };
  }
  return null;
}

/** 장소 사진 찾기 (무료 라이선스, 출처 표시) — 같은 장소는 30일 동안 다시 찾지 않는다 */
export async function POST(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "장소 이름을 확인해 주세요.", 400);
  const { city, names } = parsed.data;
  const photos: Photo[] = [];
  for (const name of names) {
    const p = await cached("place-photo", { name, city }, 30 * DAY, () => findPhoto(name, city), (v) => v !== null).catch(() => null);
    if (p) photos.push(p);
  }
  return Response.json({ photos });
}
