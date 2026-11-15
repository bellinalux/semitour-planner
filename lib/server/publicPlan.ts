/**
 * 고객용 "내 여행 코스 만들기" 서버 — 설정·남용 방지·코스 만들기·저장·통계·알림.
 * 코스 만드는 순서(비용이 적은 순서): 같은 조건 결과 → 지식 창고 인기 장소 + 코스 엔진(AI 없음) → (설정이 켜져 있으면) AI.
 */
import { finishCourse } from "@/lib/courseFinish";
import { flightDaysRequest, flightTimesFor, withFlightDays } from "@/lib/flightPlan";
import { placeScore, type PlaceCard } from "@/lib/knowledge";
import { splitIntoDays, timelineToDay, type CartPlace } from "@/lib/placeCart";
import {
  cacheKeyOf,
  compactDays,
  isSelfGuided,
  normalizePublicSettings,
  STYLES,
  toTripInput,
  type PublicPlanRequest,
  type PublicPlanResult,
  type PublicPlanSettings,
} from "@/lib/publicPlan";
import { itineraryRequestSchema } from "@/lib/schemas/itinerary";
import type { DayPlan } from "@/types";
import { workspaceId } from "./access";
import { cached, DAY } from "./aiCache";
import { getKnowledge, planCourse } from "./courseEngineServer";
import { geocodeMany, wikiNearbyPlaces } from "./freeData";
import { recordServerEvent } from "./errorLog";
import { generateItineraryDays } from "./itineraryGenerate";
import { getCity } from "./knowledgeStore";
import { getKv } from "./planStore";
import { clientKey } from "./rateLimit";
import { newShareId } from "./shareStore";

async function ns(): Promise<string> {
  return (await workspaceId()) ?? "local";
}

// ── 설정 ──

export async function getPublicSettings(): Promise<PublicPlanSettings> {
  const s = await getKv();
  if (!s) return normalizePublicSettings({});
  try {
    const raw = await s.kv.get(`pplan:settings:${await ns()}`);
    return normalizePublicSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizePublicSettings({});
  }
}

export async function savePublicSettings(patch: unknown): Promise<PublicPlanSettings> {
  const s = await getKv();
  if (!s) throw new Error("NO_STORE");
  const next = normalizePublicSettings({ ...(await getPublicSettings()), ...(typeof patch === "object" && patch ? patch : {}) });
  await s.kv.put(`pplan:settings:${await ns()}`, JSON.stringify(next));
  return next;
}

// ── 남용 방지: 하루 상한(회사·IP) + 사람 확인 ──

const today = () => new Date().toISOString().slice(0, 10);

async function bump(key: string, ttl = 2 * 86400): Promise<number> {
  const s = await getKv();
  if (!s) return 0;
  const n = Number((await s.kv.get(key)) ?? 0) + 1;
  await s.kv.put(key, String(n), { expirationTtl: ttl });
  return n;
}

async function peek(key: string): Promise<number> {
  const s = await getKv();
  return s ? Number((await s.kv.get(key)) ?? 0) : 0;
}

/** 오늘 만들 수 있는가 — 막히면 이유 */
export async function checkQuota(request: Request, settings: PublicPlanSettings): Promise<string | null> {
  const w = await ns();
  const day = today();
  if ((await peek(`pplan:day:${w}:${day}`)) >= settings.dailyCap) return "오늘 코스 만들기가 많아 잠시 쉬고 있습니다. 내일 다시 시도하시거나 견적 요청을 남겨 주세요.";
  const ip = clientKey(request).slice(0, 60);
  if ((await peek(`pplan:ip:${w}:${day}:${ip}`)) >= settings.ipDaily) return `하루 ${settings.ipDaily}번까지 만들 수 있습니다. 마음에 드는 코스로 견적을 요청해 주세요.`;
  return null;
}

export async function countUse(request: Request): Promise<void> {
  const w = await ns();
  const day = today();
  await Promise.all([bump(`pplan:day:${w}:${day}`), bump(`pplan:ip:${w}:${day}:${clientKey(request).slice(0, 60)}`)]);
}

/** Cloudflare Turnstile — 키가 없으면 건너뛴다 (하루 상한·분당 제한은 그대로) */
export function turnstileSiteKey(): string {
  return process.env.TURNSTILE_SITE_KEY?.trim() ?? "";
}
export async function verifyHuman(token: string | undefined, request: Request): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", token);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}

// ── 코스 만들기 ──

const PER_DAY = { relaxed: 3, normal: 4, packed: 5 } as const;
const THEME_HINT: Record<string, RegExp> = {
  food: /시장|맛집|거리|야시장|food/i, history: /성|사원|신사|궁|박물관|사찰|유적|museum|temple|castle/i, nature: /공원|호수|해변|산|폭포|정원|beach|park/i,
  shopping: /몰|쇼핑|거리|아울렛|시장|outlet|mall/i, photo: /전망|타워|야경|view|tower/i, activity: /체험|투어|크루즈|온천|족욕|액티비티/i, local: /골목|거리|마을|시장|민예/i,
};

/** 지식 창고에서 고른 장소 (꼭 갈 곳 먼저, 관심사 맞으면 가산) */
export function pickPlaces(places: PlaceCard[], req: Pick<PublicPlanRequest, "themes" | "mustSee">, count: number): string[] {
  const usable = places.filter((p) => ["sight", "activity", "shopping", "night"].includes(p.kind) && (p.votes?.worst ?? 0) <= (p.votes?.best ?? 0) + 2);
  const scored = usable
    .map((p) => ({ p, s: placeScore(p) + req.themes.reduce((n, t) => n + (THEME_HINT[t]?.test(`${p.name} ${p.area} ${p.tips.join(" ")}`) ? 15 : 0), 0) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p.name);
  return [...new Set([...req.mustSee, ...scored])].slice(0, count);
}

/** 담은 장소를 날짜별로 나누고, 날마다 점심을 넣어 코스 엔진이 순서·시각을 정한다 (AI 없음) */
async function scheduleCart(cart: CartPlace[], city: string, tourDays: number, selfGuided = false): Promise<DayPlan[]> {
  const groups = splitIntoDays(cart, tourDays);
  return Promise.all(
    groups.map(async (g, k) => {
      const lunch = { id: `lunch${k}`, name: selfGuided ? "점심 (자유식 · 근처 맛집)" : "점심 식사 (현지식)", stayMin: 60, kind: "meal" as const, meal: "lunch" as const };
      const plan = await planCourse({
        places: [...g.map((p) => ({ id: p.id, name: p.name, stayMin: p.stayMin, ...(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : {}) })), lunch],
        // 셀프 코스는 대중교통·도보 시간으로, 가이드 코스는 전용차량 시간으로
        city, country: "", start: "09:00", mode: selfGuided ? "public" : "car", audience: selfGuided ? "any" : "group", reorder: true, lookup: false,
      });
      const byId = new Map<string, CartPlace & { meal?: boolean }>([...g.map((p) => [p.id, p] as const), [lunch.id, { ...lunch, meal: true }]]);
      return timelineToDay(k + 1, city, "09:00", plan.best.timeline, byId);
    }),
  );
}

const cityOf = (req: PublicPlanRequest) => (req.cities[0]?.name ?? req.destination).split(/[,/]/)[0].trim();

/**
 * AI 없이 만들 장소 — 지식 창고 인기 장소(좌표는 장소 지식·OpenStreetMap) + 모자라면(useFree) 위키백과 근처 장소로 채운다.
 * 장소가 need의 70%가 안 되면 null.
 */
async function cartFor(req: PublicPlanRequest, tourDays: number, useFree: boolean): Promise<{ cart: CartPlace[]; free: boolean } | null> {
  const city = cityOf(req);
  const need = Math.max(2, tourDays * PER_DAY[req.pace]);
  const doc = await getCity(city).catch(() => null);
  const names = doc ? pickPlaces(doc.places, req, need) : [...req.mustSee];
  const known = names.length ? await getKnowledge(names, city).catch(() => ({}) as Awaited<ReturnType<typeof getKnowledge>>) : {};
  const cards = new Map((doc?.places ?? []).map((p) => [p.name, p]));
  let cart: CartPlace[] = names.map((name, i) => {
    const k = known[name];
    return { id: `k${i}`, name, stayMin: k?.typicalStayMin || cards.get(name)?.stayWeb || 60, ...(k?.lat != null && k.lng != null ? { lat: k.lat, lng: k.lng } : {}) };
  });
  let free = false;
  if (cart.length < need && useFree) {
    const wiki = await wikiNearbyPlaces(city).catch(() => []);
    const extra = wiki.filter((w) => !cart.some((c) => c.name === w.name)).slice(0, need - cart.length);
    cart = [...cart, ...extra.map((w, i) => ({ id: `w${i}`, name: w.name, stayMin: 60, lat: w.lat, lng: w.lng }))];
    free = extra.length > 0;
  }
  if (cart.length < Math.ceil(need * 0.7)) return null;
  // 좌표 없는 곳은 무료 OpenStreetMap으로 (1초에 1번이라 많으면 6곳까지만)
  const missing = cart.filter((c) => c.lat == null).map((c) => c.name);
  if (missing.length) {
    const osm = await geocodeMany(missing, city, 6).catch(() => new Map());
    cart = cart.map((c) => (c.lat == null && osm.get(c.name) ? { ...c, lat: osm.get(c.name)!.lat, lng: osm.get(c.name)!.lng } : c));
  }
  return { cart, free };
}

/** AI는 40초까지만 기다린다 — 넘기면 무료 공개 데이터 코스로 */
export const AI_BUDGET_MS = 40_000;
function withinBudget<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), ms))]);
}

/**
 * 코스 만들기 — 빠르고 비용이 적은 순서: 지식 창고(AI 없음) → AI(웹 조사 없이, 40초까지) → 무료 공개 데이터(위키백과 근처 장소, AI 없음).
 * 마무리는 직원 화면과 같은 규칙(항공 시각·미팅·식사 시간대·단체 여유·불가능 시간).
 */
export async function buildPublicPlan(req: PublicPlanRequest, settings: PublicPlanSettings, opts: { aiBudgetMs?: number } = {}): Promise<PublicPlanResult> {
  const input = toTripInput(req);
  const flight = flightDaysRequest(input);
  const tourDays = flight ? flight.aiDays : req.days;
  const city = cityOf(req);
  const selfGuided = isSelfGuided(req.style);
  let source: PublicPlanResult["source"] = "knowledge";
  let days: DayPlan[] | null = null;
  // ① 지식 창고만으로 충분하면 AI 없이 (여러 도시 여행은 AI가 도시를 나눈다)
  if (req.cities.length <= 1) {
    const c = await cartFor(req, tourDays, false).catch(() => null);
    if (c) days = await scheduleCart(c.cart, city, tourDays, selfGuided).catch(() => null);
  }
  // ② AI — 고객 화면은 웹 조사를 건너뛰고, 40초 안에 못 만들면 ③으로
  if (!days && settings.aiFallback) {
    try {
      const ai = itineraryRequestSchema.parse({
        destination: input.destination, days: tourDays, nights: req.nights, travelers: req.travelers, currency: "KRW", themes: req.themes,
        notes: selfGuided ? "자유여행 셀프 코스입니다. 가이드·전용차량 없이 대중교통·도보로 다니는 순서로 짜고, 식사는 자유식(근처 맛집 추천)으로 합니다." : "",
        travelType: req.companions.includes("senior") ? "senior" : "semi", operatingModel: selfGuided ? "backpack" : STYLES[req.style].model, productTier: "standard", tripScope: "overseas",
        regionPlan: input.regionPlan, pace: req.pace, companions: req.companions, mustHave: input.mustHave, avoid: "",
        ...(flight ? { flightDays: flight.flightDays } : {}),
      });
      days = (await withinBudget(generateItineraryDays(ai, { research: false }), opts.aiBudgetMs ?? AI_BUDGET_MS)).days;
      source = "ai";
    } catch (err) {
      // 원인을 관리자 오류 기록에 남긴다 (고객 화면에는 기본 코스로 대신)
      await recordServerEvent("ai", `고객 코스 AI 실패 (${city})`, err instanceof Error ? err.message : String(err)).catch(() => undefined);
    }
  }
  // ③ 무료 공개 데이터 — 지식 창고 + 위키백과 근처 장소
  if (!days) {
    const c = await cartFor({ ...req, cities: [] }, tourDays, true).catch(() => null);
    if (!c) throw new Error("NO_KNOWLEDGE");
    days = await scheduleCart(c.cart, city, tourDays, selfGuided);
    source = c.free ? "free" : "knowledge";
  }
  const times = flightTimesFor(input);
  const wrapped = times ? withFlightDays(days, input, times) : days;
  const finished = finishCourse(wrapped, input).days;
  return {
    days: compactDays(finished),
    source,
    note:
      source === "knowledge"
        ? "우리 여행사 지식 창고의 인기 장소로 만든 코스입니다"
        : source === "ai"
          ? "AI가 만든 추천 코스입니다 — 상담 때 실제 운영 시간·이동을 확인해 드립니다"
          : "주변 명소로 만든 기본 코스입니다 — 견적을 요청하시면 담당자가 맞춤 코스로 다듬어 드립니다",
  };
}

export class QuotaError extends Error {}

/**
 * 같은 조건이면 7일 동안 같은 결과 — 새로 만들 때만 beforeBuild(하루 상한 확인)를 부른다.
 * 그래서 같은 조건 재사용은 하루 횟수에 세지 않는다.
 */
export async function cachedPublicPlan(req: PublicPlanRequest, settings: PublicPlanSettings, beforeBuild: () => Promise<void> = async () => undefined): Promise<PublicPlanResult & { fresh: boolean }> {
  let fresh = false;
  const r = await cached("public-plan-v1", cacheKeyOf(req), 7 * DAY, async () => {
    await beforeBuild();
    fresh = true;
    return buildPublicPlan(req, settings);
  }, (x) => x.days.length > 0);
  return { ...(fresh ? r : { ...r, source: "cache" as const }), fresh };
}

// ── 저장·공유 ──

export interface SavedPublicPlan {
  id: string;
  title: string;
  request: Omit<PublicPlanRequest, "token">;
  days: DayPlan[];
  at: string;
}

export async function savePublicPlan(p: Omit<SavedPublicPlan, "id" | "at">): Promise<string> {
  const s = await getKv();
  if (!s) throw new Error("NO_STORE");
  const id = newShareId();
  const doc: SavedPublicPlan = { ...p, days: compactDays(p.days), id, at: new Date().toISOString() };
  await s.kv.put(`pplan:saved:${id}`, JSON.stringify(doc), { expirationTtl: 180 * 86400 });
  return id;
}

export async function loadPublicPlan(id: string): Promise<SavedPublicPlan | null> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return null;
  const s = await getKv();
  if (!s) return null;
  try {
    const raw = await s.kv.get(`pplan:saved:${id}`);
    return raw ? (JSON.parse(raw) as SavedPublicPlan) : null;
  } catch {
    return null;
  }
}

// ── 통계 (고객들이 많이 만든 여행지·많이 고른 장소) ──

export interface PublicStats {
  destinations: Record<string, number>;
  places: Record<string, Record<string, number>>;
  made: number;
  requested: number;
  updatedAt: string;
}

const EMPTY_STATS: PublicStats = { destinations: {}, places: {}, made: 0, requested: 0, updatedAt: "" };

export async function getPublicStats(): Promise<PublicStats> {
  const s = await getKv();
  if (!s) return EMPTY_STATS;
  try {
    const raw = await s.kv.get(`pplan:stats:${await ns()}`);
    return raw ? { ...EMPTY_STATS, ...(JSON.parse(raw) as PublicStats) } : EMPTY_STATS;
  } catch {
    return EMPTY_STATS;
  }
}

/** 코스를 만들거나(made) 견적 요청할 때(requested) 쌓는다 — 장소는 도시별로 */
export async function recordStats(destination: string, days: DayPlan[], kind: "made" | "requested"): Promise<void> {
  const s = await getKv();
  if (!s) return;
  const cur = await getPublicStats();
  const city = destination.split(/[,/]/)[0].trim().slice(0, 40);
  const places = { ...cur.places, [city]: { ...(cur.places[city] ?? {}) } };
  for (const i of days.flatMap((d) => d.items)) {
    if (!["sightseeing", "experience", "shopping"].includes(i.type ?? "sightseeing")) continue;
    places[city][i.name] = (places[city][i.name] ?? 0) + (kind === "requested" ? 2 : 1);
  }
  // 도시마다 많이 고른 60곳만 남긴다
  places[city] = Object.fromEntries(Object.entries(places[city]).sort((a, b) => b[1] - a[1]).slice(0, 60));
  const next: PublicStats = {
    destinations: { ...cur.destinations, [city]: (cur.destinations[city] ?? 0) + 1 },
    places,
    made: cur.made + (kind === "made" ? 1 : 0),
    requested: cur.requested + (kind === "requested" ? 1 : 0),
    updatedAt: new Date().toISOString(),
  };
  await s.kv.put(`pplan:stats:${await ns()}`, JSON.stringify(next));
}

/** 이 도시에서 고객들이 많이 고른 장소 */
export async function popularPlaces(destination: string, limit = 8): Promise<{ name: string; count: number }[]> {
  const city = destination.split(/[,/]/)[0].trim();
  const stats = await getPublicStats();
  const fromCustomers = Object.entries(stats.places[city] ?? {}).map(([name, count]) => ({ name, count }));
  if (fromCustomers.length >= limit) return fromCustomers.sort((a, b) => b.count - a.count).slice(0, limit);
  // 고객 기록이 적으면 지식 창고 인기 순으로 채운다
  const doc = await getCity(city).catch(() => null);
  const extra = (doc?.places ?? [])
    .filter((p) => ["sight", "activity", "shopping", "night"].includes(p.kind) && !fromCustomers.some((c) => c.name === p.name))
    .sort((a, b) => placeScore(b) - placeScore(a))
    .map((p) => ({ name: p.name, count: 0 }));
  return [...fromCustomers.sort((a, b) => b.count - a.count), ...extra].slice(0, limit);
}

/** 기간별 추천 코스 — 지식 창고의 인기 코스 묶음 (다른 여행사·후기에서 함께 도는 곳) */
export async function recommendedCourses(destination: string): Promise<{ title: string; places: string[]; note: string }[]> {
  const city = destination.split(/[,/]/)[0].trim();
  const doc = await getCity(city).catch(() => null);
  return (doc?.courses ?? [])
    .slice()
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 6)
    .map((c) => ({ title: c.name, places: c.places.slice(0, 8), note: c.note }));
}

// ── 새 견적 요청 알림 (이메일) ──

/** Resend(무료 월 3,000통)로 보낸다 — RESEND_API_KEY와 알림 이메일이 있어야. 실패해도 견적 접수는 그대로 */
export async function notifyInquiry(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !to) return false;
  const from = process.env.NOTIFY_FROM?.trim() || "Semitour <onboarding@resend.dev>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: subject.slice(0, 120), text: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
