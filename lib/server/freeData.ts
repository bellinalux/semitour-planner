/**
 * 키 없이 쓰는 무료 공개 데이터 — AI 한도를 아끼고, AI를 못 쓸 때도 기본 기능이 돌게 한다.
 *  - 좌표: OpenStreetMap Nominatim (정책: 초당 1회, 앱 이름이 담긴 User-Agent, 결과는 저장해 다시 묻지 않는다)
 *  - 날씨: Open-Meteo 과거 기상(작년 같은 기간 평균) — 키 없음
 *  - 번역: Cloudflare Workers AI 번역 전용 모델(m2m100) — 일반 AI보다 사용량이 훨씬 적다
 *  (공휴일 Nager.Date, 환율 open.er-api, 장소 사진 위키백과는 이미 무료 데이터를 쓴다)
 */
import { workerEnv } from "./cfEnv";
import { getKv } from "./planStore";

const UA = "SemitourPlanner/1.0 (travel itinerary planner)";
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// ── 좌표 (Nominatim) ─────────────────────────────────────

export interface GeoHit {
  lat: number;
  lng: number;
  name: string;
  /** ISO 국가 코드 (대문자) */
  countryCode: string;
}

let lastNominatim = 0;
async function politeWait() {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
}

/** 이름으로 좌표 찾기 (90일 저장). 못 찾으면 null */
export async function geocode(query: string): Promise<GeoHit | null> {
  const q = query.trim().slice(0, 200);
  if (!q) return null;
  const store = await getKv();
  const key = `osm:${norm(q)}`.slice(0, 480);
  const cached = store ? await store.kv.get(key).catch(() => null) : null;
  if (cached) {
    try {
      const v = JSON.parse(cached) as GeoHit | { none: true };
      return "none" in v ? null : v;
    } catch {
      /* 다시 찾기 */
    }
  }
  await politeWait();
  let hit: GeoHit | null = null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=ko,en&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const list = (await res.json()) as { lat: string; lon: string; display_name?: string; name?: string; address?: { country_code?: string } }[];
      const first = list[0];
      if (first && isFinite(Number(first.lat)) && isFinite(Number(first.lon))) {
        hit = { lat: Number(first.lat), lng: Number(first.lon), name: first.name || first.display_name?.split(",")[0] || q, countryCode: (first.address?.country_code ?? "").toUpperCase() };
      }
    } else return null; // 일시 오류는 저장하지 않는다
  } catch {
    return null;
  }
  if (store) await store.kv.put(key, JSON.stringify(hit ?? { none: true }), { expirationTtl: 60 * 60 * 24 * 90 }).catch(() => undefined);
  return hit;
}

/** 여러 장소 (도시 이름을 붙여 찾고, 못 찾으면 이름만으로) — 초당 1회라 많으면 앞의 limit개만 */
export async function geocodeMany(names: string[], city: string, limit = 8): Promise<Map<string, GeoHit>> {
  const out = new Map<string, GeoHit>();
  for (const n of names.slice(0, limit)) {
    const hit = (await geocode(city ? `${n}, ${city}` : n)) ?? (city ? await geocode(n) : null);
    if (hit) out.set(n, hit);
  }
  return out;
}

// ── 날씨 (Open-Meteo, 작년 같은 기간) ─────────────────────────

export interface WeatherSummary {
  text: string;
  avgMax: number;
  avgMin: number;
  rainyDays: number;
  days: number;
}

/** 여행 기간과 같은 날짜의 작년 날씨 평균 (기간이 너무 길면 앞 14일). 못 받으면 null */
export async function lastYearWeather(lat: number, lng: number, from: string, to: string): Promise<WeatherSummary | null> {
  const shift = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
  const start = shift(from);
  let end = shift(to);
  if ((Date.parse(end) - Date.parse(start)) / 86_400_000 > 13) end = new Date(Date.parse(start) + 13 * 86_400_000).toISOString().slice(0, 10);
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const d = ((await res.json()) as { daily?: { temperature_2m_max?: (number | null)[]; temperature_2m_min?: (number | null)[]; precipitation_sum?: (number | null)[] } }).daily;
    const nums = (a?: (number | null)[]) => (a ?? []).filter((x): x is number => typeof x === "number");
    const max = nums(d?.temperature_2m_max);
    const min = nums(d?.temperature_2m_min);
    const rain = nums(d?.precipitation_sum);
    if (!max.length || !min.length) return null;
    const avg = (a: number[]) => Math.round(a.reduce((s, x) => s + x, 0) / a.length);
    const rainyDays = rain.filter((x) => x >= 1).length;
    const avgMax = avg(max);
    const avgMin = avg(min);
    const wear = avgMax >= 27 ? "가벼운 여름옷·자외선 차단" : avgMax >= 18 ? "얇은 겉옷" : avgMax >= 10 ? "도톰한 겉옷" : "패딩·방한용품";
    return {
      text: `작년 같은 기간 평균 최고 ${avgMax}°C·최저 ${avgMin}°C, 비 온 날 ${rainyDays}일/${max.length}일 — ${wear}${rainyDays >= Math.ceil(max.length / 2) ? ", 우산·우비 필수" : ""} (Open-Meteo)`,
      avgMax,
      avgMin,
      rainyDays,
      days: max.length,
    };
  } catch {
    return null;
  }
}

// ── 번역 (Cloudflare m2m100) ─────────────────────────────

interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
const M2M_LANG = { en: "english", ja: "japanese", zh: "chinese" } as const;

/** 한국어 글들을 번역 (Cloudflare AI 연결이 없거나 실패하면 null) */
export async function m2mTranslate(texts: string[], lang: keyof typeof M2M_LANG): Promise<string[] | null> {
  const ai = await workerEnv<AiBinding>("AI");
  if (!ai || typeof ai.run !== "function") return null;
  const out: string[] = new Array(texts.length);
  try {
    for (let i = 0; i < texts.length; i += 8) {
      const batch = texts.slice(i, i + 8);
      const done = await Promise.all(
        batch.map(async (t) => {
          if (!t.trim() || !/[가-힣]/.test(t)) return t;
          const r = (await ai.run("@cf/meta/m2m100-1.2b", { text: t, source_lang: "korean", target_lang: M2M_LANG[lang] })) as { translated_text?: string } | null;
          return r?.translated_text?.trim() || t;
        }),
      );
      done.forEach((v, k) => (out[i + k] = v));
    }
    return out;
  } catch {
    return null;
  }
}

// ── 관광지 (위키백과 주변 문서) ─────────────────────────────

/** 도시 주변(반경 15km) 위키백과 문서 제목 — 관광지 조사의 참고 목록 (역·학교 같은 것은 뺀다). 못 받으면 [] */
export async function wikiNearby(city: string, limit = 40): Promise<string[]> {
  const g = await geocode(city);
  if (!g) return [];
  const store = await getKv();
  const key = `wikinear:${norm(city)}`.slice(0, 480);
  const cached = store ? await store.kv.get(key).catch(() => null) : null;
  if (cached) {
    try {
      return JSON.parse(cached) as string[];
    } catch {
      /* 다시 */
    }
  }
  const titles: string[] = [];
  for (const lang of ["ko", "en"]) {
    try {
      const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${g.lat}|${g.lng}&gsradius=10000&gslimit=${limit}&format=json&origin=*`;
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const list = ((await res.json()) as { query?: { geosearch?: { title: string }[] } }).query?.geosearch ?? [];
      titles.push(...list.map((x) => x.title).filter((t) => !/역$|station|학교|school|대학|university|병원|hospital|구청|시청|아파트|주식회사|\(동\)|동$/i.test(t)));
      if (titles.length >= 15) break;
    } catch {
      /* 다음 언어 */
    }
  }
  const out = [...new Set(titles)].slice(0, limit);
  if (store && out.length) await store.kv.put(key, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 90 }).catch(() => undefined);
  return out;
}
