/**
 * 코스 엔진 서버 쪽 — 엔진(lib/courseEngine, 순수 계산)에 실제 데이터를 붙인다.
 *  1) 장소 지식: KV(pk:)에 저장된 장소 정보(영업시간·좌표·마지막 입장·보통 머무는 시간·좋은 시간대·예약·팁)를 먼저 쓰고,
 *     없는 곳만 Gemini + 구글 지도(Grounding with Google Maps)로 한 번에 찾아 30일 저장한다. 사람이 고친 정보(source:'manual')가 우선.
 *  2) 날짜: 출발일 → 요일·공휴일(Nager.Date 공개 데이터, 30일 저장)·일몰
 *  3) 이동 시간표: 서버에 GOOGLE_MAPS_API_KEY가 있으면 Google Routes(교통 반영), 없으면 거리로 어림
 */
import { z } from "zod";
import {
  estimateMatrix, isoForCountry, planDay, sunTimes, timeZoneForCountry,
  type Audience, type DayKey, type EngineOptions, type EnginePlace, type MoveMode, type PlanResult,
} from "@/lib/courseEngine";
import { endpoint, modelName, resolveKey } from "./gemini";
import { cached, DAY } from "./aiCache";
import { getKv } from "./planStore";

/* ── 요청 형식 ── */
const openSchema = z.object({ mon: z.string(), tue: z.string(), wed: z.string(), thu: z.string(), fri: z.string(), sat: z.string(), sun: z.string() }).partial();
export const enginePlaceSchema = z.object({
  id: z.string().max(80),
  name: z.string().max(200),
  nameEn: z.string().max(200).optional(),
  area: z.string().max(120).optional(),
  lat: z.number().optional(), lng: z.number().optional(),
  stayMin: z.number().int().min(0).max(720),
  kind: z.enum(["sight", "meal", "meeting", "end", "free", "transfer"]).optional(),
  open: openSchema.optional(),
  lastEntry: z.string().max(10).optional(),
  fixedTime: z.string().max(10).optional(),
  best: z.enum(["morning", "afternoon", "sunset", "night", ""]).optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  fixedOrder: z.enum(["first", "last"]).optional(),
});
export const planRequestSchema = z.object({
  places: z.array(enginePlaceSchema).min(1).max(20),
  city: z.string().max(120).default(""),
  country: z.string().max(80).default(""),
  /** 출발일 "2026-10-12" (모르면 요일 검사 없이) */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start: z.string().max(10).default("09:00"),
  maxEnd: z.string().max(10).optional(),
  mode: z.enum(["car", "walk", "public"]).default("car"),
  audience: z.enum(["any", "couple", "family", "senior", "group"]).default("any"),
  reorder: z.boolean().default(true),
  /** 장소 정보를 구글 지도로 찾아 채울지 (꺼도 저장된 지식은 씀) */
  lookup: z.boolean().default(true),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;

/* ── 장소 지식 ── */
export interface PlaceKnowledge {
  name: string; city: string; mapName?: string; address?: string; lat?: number; lng?: number;
  open?: Partial<Record<DayKey, string>>; lastEntry?: string; typicalStayMin?: number; best?: EnginePlace["best"];
  reservation?: string; tips?: string[]; uri?: string; source: "gmaps" | "manual"; updatedAt: string;
}
const KNOW_TTL = 60 * 60 * 24 * 30;
const norm = (s: string) => s.toLowerCase().replace(/[\s()[\]·,.'"\-–_/]/g, "");
export const knowKey = (name: string, city: string) => `pk:${norm(city)}:${norm(name)}`.slice(0, 480);

type Kv = NonNullable<Awaited<ReturnType<typeof getKv>>>["kv"] & { put(key: string, value: string, options?: { metadata?: unknown; expirationTtl?: number }): Promise<void> };
async function kv(): Promise<Kv | null> { const s = await getKv(); return s ? (s.kv as Kv) : null; }

export async function getKnowledge(names: string[], city: string): Promise<Record<string, PlaceKnowledge>> {
  const store = await kv(); const out: Record<string, PlaceKnowledge> = {};
  if (!store) return out;
  await Promise.all(names.map(async n => { const raw = await store.get(knowKey(n, city)); if (raw) try { out[n] = JSON.parse(raw); } catch { /* 깨진 값 */ } }));
  return out;
}
export async function putKnowledge(k: PlaceKnowledge): Promise<void> {
  const store = await kv(); if (!store) return;
  const key = knowKey(k.name, k.city);
  if (k.source !== "manual") {   // 사람이 고친 정보는 자동 정보로 덮지 않는다
    const prev = await store.get(key);
    if (prev) try { if (JSON.parse(prev).source === "manual") return; } catch { /* 무시 */ }
  }
  await store.put(key, JSON.stringify(k), k.source === "manual" ? {} : { expirationTtl: KNOW_TTL });
}

/** 구글 지도로 장소 정보 찾기 (한 번에) */
async function lookupPlaces(list: { name: string; nameEn?: string; area?: string }[], city: string, country: string, anchor?: { lat: number; lng: number }): Promise<PlaceKnowledge[]> {
  if (!list.length) return [];
  const prompt = `구글 지도에서 아래 여행 코스 장소를 하나씩 찾아, 여행 상품 코스를 짜는 전문가에게 필요한 실제 정보를 JSON으로만 답하라.
지역: ${[city, country].filter(Boolean).join(", ") || "(장소 이름으로 판단)"}
장소 (i는 번호):
${list.map((p, i) => `${i}. ${p.name}${p.nameEn ? ` / ${p.nameEn}` : ""}${p.area ? ` (${p.area})` : ""}`).join("\n")}
규칙:
- 식사·자유 시간·미팅처럼 특정 장소가 아니거나 확인하지 못하면 found:false.
- open: 요일별 영업시간 "HH:MM-HH:MM"(여러 구간은 쉼표), 휴무 "closed", 24시간 "24h", 모르면 "".
- lastEntry: 마지막 입장 시각(있을 때만). typicalStayMin: 관광객이 보통 머무는 시간(분).
- best: 가장 좋은 시간대 morning|afternoon|sunset|night|"" (붐빔·빛·풍경 기준).
- reservation: 예약 필요 여부·방법 한 줄(없으면 ""). tips: 현지 가이드가 알려 줄 짧은 팁 0~3개(복장 규정·붐비는 시간·사진 명소 등).
출력: {"places":[{"i":0,"found":true,"name":"구글 지도 이름","address":"","lat":0,"lng":0,"open":{"mon":"","tue":"","wed":"","thu":"","fri":"","sat":"","sun":""},"lastEntry":"","typicalStayMin":0,"best":"","reservation":"","tips":[]}]}`;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ googleMaps: {} }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  };
  if (anchor) body.toolConfig = { retrievalConfig: { latLng: { latitude: anchor.lat, longitude: anchor.lng } } };
  const res = await fetch(`${endpoint()}/${modelName()}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": resolveKey() }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const j = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; groundingMetadata?: { groundingChunks?: { maps?: { uri?: string; title?: string } }[] } }[] };
  if (!res.ok) throw new Error("구글 지도 확인 실패");
  const c = j.candidates?.[0];
  const text = (c?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? "").join("");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  let parsed: { places?: Record<string, unknown>[] } = {};
  try { parsed = JSON.parse(text.slice(a, b + 1)); } catch { return []; }
  const chunks = (c?.groundingMetadata?.groundingChunks ?? []).map(g => g.maps).filter(Boolean) as { uri?: string; title?: string }[];
  const now = new Date().toISOString();
  const out: PlaceKnowledge[] = [];
  (parsed.places ?? []).forEach(raw => {
    const i = Number(raw.i), src = list[i];
    if (!src || !raw.found) return;
    const mapName = String(raw.name ?? "");
    const lat = Number(raw.lat), lng = Number(raw.lng);
    const okLL = isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0);
    const chunk = chunks.find(ch => ch.title && mapName && (ch.title.includes(mapName) || mapName.includes(ch.title)));
    out.push({
      name: src.name, city, mapName, address: String(raw.address ?? ""), ...(okLL ? { lat, lng } : {}),
      open: (raw.open as PlaceKnowledge["open"]) ?? {}, lastEntry: String(raw.lastEntry ?? "") || undefined,
      typicalStayMin: Number(raw.typicalStayMin) > 0 ? Number(raw.typicalStayMin) : undefined,
      best: (["morning", "afternoon", "sunset", "night"].includes(String(raw.best)) ? raw.best : "") as EnginePlace["best"],
      reservation: String(raw.reservation ?? ""), tips: Array.isArray(raw.tips) ? (raw.tips as unknown[]).map(String).slice(0, 3) : [],
      uri: chunk?.uri, source: "gmaps", updatedAt: now,
    });
  });
  return out;
}

/* ── 공휴일 ── */
export async function holidays(country: string, year: number): Promise<{ date: string; name: string }[]> {
  const iso = isoForCountry(country); if (!iso) return [];
  const store = await kv(); const key = `hol:${iso}:${year}`;
  const cached = store ? await store.get(key) : null;
  if (cached) try { return JSON.parse(cached); } catch { /* 다시 받기 */ }
  try {
    const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${iso}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return [];
    const list = ((await r.json()) as { date: string; localName?: string; name?: string }[]).map(h => ({ date: h.date, name: h.localName || h.name || "" }));
    if (store) await store.put(key, JSON.stringify(list), { expirationTtl: 60 * 60 * 24 * 30 });
    return list;
  } catch { return []; }
}

/* ── 이동 시간표 ── */
/** 서버의 구글 지도 키. 대시보드에 붙여넣다 딸려 오기 쉬운 따옴표·공백·줄바꿈·"GOOGLE_MAPS_API_KEY=" 글자를 걷어낸다 (Gemini 키와 같은 방식) */
export function mapsKey(): string {
  return (process.env.GOOGLE_MAPS_API_KEY ?? "")
    .trim()
    .replace(/^GOOGLE_MAPS_API_KEY\s*=\s*/, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, "");
}

/** 구글 지도를 못 쓴 이유 (화면에 "거리 어림 — 이유"로 보여 준다). 구글 지도를 썼으면 빈 문자열 */
type MatrixResult = { M: number[][]; source: "google" | "estimate"; note: string };

export async function travelMatrix(places: EnginePlace[], mode: MoveMode): Promise<MatrixResult> {
  const est = estimateMatrix(places, mode);
  const key = mapsKey();
  const pts = places.map(p => (p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null));
  if (!key) return { M: est, source: "estimate", note: "서버에 GOOGLE_MAPS_API_KEY가 없습니다" };
  if (pts.filter(Boolean).length < 2) return { M: est, source: "estimate", note: "좌표를 찾은 장소가 2곳 미만입니다" };
  // Google Routes는 호출마다 요금이 나가므로, 같은 좌표·이동수단 조합은 7일 동안 다시 쓴다(성공한 결과만)
  const rounded = pts.map(p => (p ? [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lng * 1e5) / 1e5] : null));
  return cached("routes", { rounded, mode }, 7 * DAY, () => googleMatrix(key, pts, est, mode), r => r.source === "google");
}

async function googleMatrix(key: string, pts: ({ lat: number; lng: number } | null)[], est: number[][], mode: MoveMode): Promise<MatrixResult> {
  try {
    const ok = pts.map((p, i) => (p ? i : -1)).filter(i => i >= 0);
    const wp = (i: number) => ({ waypoint: { location: { latLng: { latitude: pts[i]!.lat, longitude: pts[i]!.lng } } } });
    const r = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "originIndex,destinationIndex,duration,condition" },
      body: JSON.stringify({ origins: ok.map(wp), destinations: ok.map(wp), travelMode: mode === "walk" ? "WALK" : mode === "public" ? "TRANSIT" : "DRIVE" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      // 키는 있는데 구글이 거절한 경우 — Routes API 미사용·결제 미연결·키 제한 등. 원인을 짧게 보여 준다
      const body = (await r.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null;
      const why = body?.error?.message?.slice(0, 120) ?? "";
      return { M: est, source: "estimate", note: `구글 지도 응답 오류 ${r.status}${body?.error?.status ? ` ${body.error.status}` : ""}${why ? ` — ${why}` : ""}` };
    }
    const rows = (await r.json()) as { originIndex?: number; destinationIndex?: number; duration?: string; condition?: string }[];
    const M = est.map(row => row.slice());
    rows.forEach(e => {
      if (e.condition !== "ROUTE_EXISTS" || e.duration == null) return;
      const a = ok[e.originIndex ?? 0], b = ok[e.destinationIndex ?? 0];
      if (a !== b) M[a][b] = Math.round(parseFloat(e.duration) / 60);
    });
    return { M, source: "google", note: "" };
  } catch { return { M: est, source: "estimate", note: "구글 지도에 연결하지 못했습니다 (시간 초과·네트워크)" }; }
}

/* ── 전체 ── */
export interface PlanResponse extends PlanResult {
  places: (EnginePlace & { knowledge?: PlaceKnowledge })[];
  context: { weekday: number | null; holiday: string | null; sunset: string | null; sunrise: string | null; matrix: "google" | "estimate"; matrixNote?: string; looked: number; known: number };
}

export async function planCourse(req: PlanRequest): Promise<PlanResponse> {
  const real = req.places.filter(p => (p.kind ?? "sight") === "sight");
  const know = await getKnowledge(real.map(p => p.name), req.city);
  // 저장된 지식이 없고 영업시간·좌표도 모르는 곳만 구글 지도로
  const need = req.lookup ? real.filter(p => !know[p.name] && (!p.open || p.lat == null)) : [];
  let looked = 0;
  if (need.length) {
    const anchor = req.places.find(p => p.lat != null && p.lng != null);
    const found = await lookupPlaces(need, req.city, req.country, anchor ? { lat: anchor.lat!, lng: anchor.lng! } : undefined).catch(() => []);
    looked = found.length;
    await Promise.all(found.map(k => { know[k.name] = k; return putKnowledge(k); }));
  }
  const places = req.places.map(p => {
    const k = know[p.name];
    const merged: EnginePlace & { knowledge?: PlaceKnowledge } = {
      id: p.id, name: p.name, kind: p.kind, priority: p.priority, fixedOrder: p.fixedOrder, fixedTime: p.fixedTime,
      stayMin: p.stayMin || k?.typicalStayMin || 60,
      lat: p.lat ?? k?.lat, lng: p.lng ?? k?.lng,
      open: p.open ?? k?.open, lastEntry: p.lastEntry ?? k?.lastEntry, best: p.best ?? k?.best,
      ...(k ? { knowledge: k } : {}),
    };
    return merged;
  });
  // 날짜 정보
  let weekday: number | null = null, holiday: string | null = null, sun: { sunrise: string; sunset: string } | null = null;
  if (req.date) {
    const d = new Date(`${req.date}T12:00:00Z`);
    weekday = d.getUTCDay();
    const hol = (await holidays(req.country, d.getUTCFullYear())).find(h => h.date === req.date);
    holiday = hol ? hol.name : null;
    const anchor = places.find(p => p.lat != null && p.lng != null);
    if (anchor) sun = sunTimes(anchor.lat!, anchor.lng!, d, timeZoneForCountry(req.country));
  }
  const { M, source, note: matrixNote } = await travelMatrix(places, req.mode);
  const o: EngineOptions = {
    start: req.start, weekday: weekday ?? undefined, maxEnd: req.maxEnd, mode: req.mode, audience: req.audience as Audience,
    lunch: { from: "11:30", to: "14:00" }, sunset: sun?.sunset, bufferMin: 5,
  };
  const r = planDay(places, M, o, req.reorder);
  if (holiday) {
    const note = `${req.date}은 공휴일(${holiday})입니다 — 휴관·단축 운영을 확인하세요`;
    r.current.violations.unshift(note); r.best.violations.unshift(note);
  }
  return { ...r, places, context: { weekday, holiday, sunset: sun?.sunset ?? null, sunrise: sun?.sunrise ?? null, matrix: source, matrixNote, looked, known: Object.keys(know).length } };
}
