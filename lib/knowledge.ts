import { z } from "zod";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { Companion, DayPlan } from "@/types";

/**
 * 지식 창고 — 코스를 만들 때 조사한 웹 후기·인기 코스·다른 여행사 상품과, 우리 현장·고객·판매 결과를 도시별로 쌓는다.
 * 다음 코스는 이 창고를 먼저 보고(점수 높은 곳부터) 만든다. 쓸수록 우리 자료(현장 실측·후기·성약)의 비중이 커진다.
 *
 * 저작권·약관: 후기 원문은 저장하지 않는다 — 요약 한 줄·숫자·출처 링크만. 고객 이름·연락처는 넣지 않는다.
 * 순수 함수만 둔다 (서버 저장은 lib/server/knowledgeStore.ts).
 */

export const COMPANION_IDS = ["senior", "kids", "infant", "couple", "friends", "group"] as const;
const LIST = 5;
const NOTE = 120;

export interface PlaceCard {
  key: string;
  name: string;
  /** 구역·동네 */
  area: string;
  kind: "sight" | "meal" | "activity" | "shopping" | "night";
  /** 웹 후기·추천에서의 인기 (0~100, 조사 평균) */
  popularity: number;
  /** 몇 번의 조사에서 나왔는지 */
  seen: number;
  /** 이 장소를 넣은 다른 여행사 */
  agencies: string[];
  /** 잘 맞는 동반자 */
  fits: Companion[];
  likes: string[];
  dislikes: string[];
  tips: string[];
  /** 웹에서 본 보통 체류(분) */
  stayWeb: number;
  /** 우리 현장에서 잰 체류 (가이드 체크) */
  stayField?: { avg: number; n: number };
  /** 우리 고객 평가 — 좋았던 곳(best)·아쉬운 곳(worst)으로 고른 수 */
  votes?: { best: number; worst: number };
  sales?: { won: number; lost: number };
  /** 직원이 AI 일정에서 뺀 수·직접 넣은 수 */
  edits?: { removed: number; added: number };
  fieldNotes: string[];
  sources: { title: string; url: string }[];
  /** 직원이 확인했으면 true (잠금 — 조사가 덮어쓰지 않는다) */
  verified: boolean;
  updatedAt: string;
}

export interface CourseCard {
  key: string;
  name: string;
  places: string[];
  agencies: string[];
  popularity: number;
  note: string;
  updatedAt: string;
}

export interface NeedCard {
  segment: Companion | "general";
  likes: string[];
  avoid: string[];
  tips: string[];
}

export interface FieldNote {
  at: string;
  day: number;
  type: string;
  text: string;
}

export interface CityKnowledge {
  city: string;
  places: PlaceCard[];
  courses: CourseCard[];
  needs: NeedCard[];
  fieldNotes: FieldNote[];
  researchedAt: string;
  researchCount: number;
  /** 우리 자료로 배운 횟수 (현장·후기·판매·직원 수정) */
  learnedCount: number;
  updatedAt: string;
}

export const MAX_PLACES = 300;
const MAX_COURSES = 40;
const MAX_NOTES = 60;

/** 장소·도시 이름 비교용 — 괄호 안 병기는 빼고 공백·기호를 지운다 */
export function knowledgeKey(name: string): string {
  return name
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .toLowerCase()
    .replace(/[\s·,.'"\-–_/!?~]/g, "")
    .slice(0, 80);
}

/** 여행지 문자열에서 도시들 ("다낭, 호이안" → ["다낭","호이안"]) */
export function citiesOf(destination: string): string[] {
  return [...new Set(destination.split(/[,·/&+]|그리고/).map((s) => s.trim()).filter(Boolean))].slice(0, 4);
}

export function emptyCity(city: string): CityKnowledge {
  return { city, places: [], courses: [], needs: [], fieldNotes: [], researchedAt: "", researchCount: 0, learnedCount: 0, updatedAt: "" };
}

const uniq = (xs: string[], n = LIST) => [...new Set(xs.map((x) => x.trim().slice(0, NOTE)).filter(Boolean))].slice(0, n);

/* ── 웹 조사 결과 (AI가 채우는 형식) ── */

const place = z.object({
  name: z.string().describe("현지에서 검색되는 실제 장소 이름 (한국어, 괄호에 현지어/영문 병기 가능)"),
  area: z.string().describe("구역·동네 이름. 모르면 빈 문자열"),
  kind: z.enum(["sight", "meal", "activity", "shopping", "night"]),
  popularity: z.number().describe("후기·추천 글에서 얼마나 자주·좋게 나오는지 0~100"),
  agencies: z.array(z.string()).describe("이 장소를 일정에 넣은 여행사·판매처 이름 (확인한 것만)"),
  fits: z.array(z.enum(COMPANION_IDS)).describe("특히 잘 맞는 동반자 유형"),
  likes: z.array(z.string()).describe("여행자들이 좋다고 한 점 (짧은 요약, 원문 인용 금지) 최대 3개"),
  dislikes: z.array(z.string()).describe("불만·주의 (짧은 요약) 최대 3개"),
  tips: z.array(z.string()).describe("가기 좋은 시간·팁 최대 2개"),
  stayMinutes: z.number().describe("보통 머무는 시간(분). 모르면 0"),
});

export const researchSchema = z.object({
  places: z.array(place).max(40).describe("이 도시에서 여행자들이 많이 가고 좋아하는 곳 (인기순)"),
  courses: z
    .array(
      z.object({
        name: z.string().describe("코스 이름 (예: 바나힐 하루 코스)"),
        places: z.array(z.string()).describe("방문 순서대로 장소 이름"),
        agencies: z.array(z.string()).describe("이 코스를 파는 여행사·판매처"),
        popularity: z.number().describe("0~100"),
        note: z.string().describe("이 코스가 인기 있는 이유 한 줄"),
      }),
    )
    .max(12),
  needs: z
    .array(
      z.object({
        segment: z.enum([...COMPANION_IDS, "general"]),
        likes: z.array(z.string()).describe("이 유형 여행자가 좋아하는 것 (짧게) 최대 4개"),
        avoid: z.array(z.string()).describe("피하고 싶어하는 것·불만 최대 4개"),
        tips: z.array(z.string()).describe("일정 짤 때 챙길 것 최대 3개"),
      }),
    )
    .max(7),
});
export type ResearchResult = z.infer<typeof researchSchema>;

/** 조사 결과를 창고에 합친다 — 직원이 확인(잠금)한 장소는 인기·출처만 더하고 내용은 그대로 */
export function mergeResearch(doc: CityKnowledge, r: ResearchResult, sources: { title: string; url: string }[], now = new Date()): CityKnowledge {
  const at = now.toISOString();
  const places = new Map(doc.places.map((p) => [p.key, p]));
  for (const p of r.places) {
    const key = knowledgeKey(p.name);
    if (!key) continue;
    const old = places.get(key);
    const pop = Math.max(0, Math.min(100, Math.round(p.popularity)));
    if (!old) {
      places.set(key, {
        key,
        name: p.name.trim().slice(0, 80),
        area: p.area.trim().slice(0, 40),
        kind: p.kind,
        popularity: pop,
        seen: 1,
        agencies: uniq(p.agencies, 8),
        fits: [...new Set(p.fits)],
        likes: uniq(p.likes),
        dislikes: uniq(p.dislikes),
        tips: uniq(p.tips),
        stayWeb: Math.max(0, Math.round(p.stayMinutes)),
        fieldNotes: [],
        sources: sources.slice(0, 3),
        verified: false,
        updatedAt: at,
      });
      continue;
    }
    const seen = old.seen + 1;
    places.set(key, {
      ...old,
      popularity: Math.round((old.popularity * old.seen + pop) / seen),
      seen,
      agencies: uniq([...old.agencies, ...p.agencies], 8),
      ...(old.verified
        ? {}
        : {
            area: old.area || p.area.trim().slice(0, 40),
            fits: [...new Set([...old.fits, ...p.fits])],
            likes: uniq([...p.likes, ...old.likes]),
            dislikes: uniq([...p.dislikes, ...old.dislikes]),
            tips: uniq([...p.tips, ...old.tips]),
            stayWeb: p.stayMinutes > 0 ? Math.round(p.stayMinutes) : old.stayWeb,
          }),
      sources: uniqSources([...old.sources, ...sources]),
      updatedAt: at,
    });
  }
  const courses = new Map(doc.courses.map((c) => [c.key, c]));
  for (const c of r.courses) {
    const key = knowledgeKey(c.places.join("-")) || knowledgeKey(c.name);
    if (!key) continue;
    const old = courses.get(key);
    courses.set(key, {
      key,
      name: c.name.trim().slice(0, 80),
      places: c.places.map((p) => p.trim().slice(0, 80)).filter(Boolean).slice(0, 10),
      agencies: uniq([...(old?.agencies ?? []), ...c.agencies], 8),
      popularity: old ? Math.round((old.popularity + c.popularity) / 2) : Math.round(c.popularity),
      note: c.note.trim().slice(0, NOTE) || old?.note || "",
      updatedAt: at,
    });
  }
  const needs = new Map(doc.needs.map((n) => [n.segment, n]));
  for (const n of r.needs) {
    const old = needs.get(n.segment);
    needs.set(n.segment, { segment: n.segment, likes: uniq([...n.likes, ...(old?.likes ?? [])], 6), avoid: uniq([...n.avoid, ...(old?.avoid ?? [])], 6), tips: uniq([...n.tips, ...(old?.tips ?? [])], 5) });
  }
  return {
    ...doc,
    places: [...places.values()].sort((a, b) => placeScore(b) - placeScore(a)).slice(0, MAX_PLACES),
    courses: [...courses.values()].sort((a, b) => b.popularity - a.popularity).slice(0, MAX_COURSES),
    needs: [...needs.values()],
    researchedAt: at,
    researchCount: doc.researchCount + 1,
    updatedAt: at,
  };
}

function uniqSources(xs: { title: string; url: string }[]) {
  const seen = new Set<string>();
  return xs.filter((s) => /^https?:\/\//.test(s.url) && !seen.has(s.url) && seen.add(s.url)).slice(0, 5);
}

/* ── 점수 ── */

/**
 * 장소 점수 — 웹 인기(40%) + 다른 여행사 포함(곳당 8, 최대 32) + 우리 고객(좋았던 곳 +6 / 아쉬운 곳 −8)
 * + 성약(+4 / 실패 −2) − 직원이 뺀 수(−6) + 직접 넣은 수(+4) + 직원 확인 10. 우리 자료가 쌓일수록 웹 인기보다 무거워진다.
 */
export function placeScore(p: PlaceCard): number {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return Math.round(
    p.popularity * 0.4 +
      Math.min(32, p.agencies.length * 8) +
      clamp((p.votes?.best ?? 0) * 6 - (p.votes?.worst ?? 0) * 8, -40, 40) +
      clamp((p.sales?.won ?? 0) * 4 - (p.sales?.lost ?? 0) * 2, -20, 24) +
      clamp((p.edits?.added ?? 0) * 4 - (p.edits?.removed ?? 0) * 6, -30, 20) +
      (p.verified ? 10 : 0),
  );
}

/** 이 장소를 넣은 이유 한 줄 (일정 카드 배지·지식 창고 화면) */
export function reasonFor(p: PlaceCard, rank?: number): string {
  const parts = [
    rank !== undefined && rank < 10 ? `인기 ${rank + 1}위` : p.popularity >= 70 ? "후기 인기" : "",
    p.agencies.length > 0 ? `여행사 ${p.agencies.length}곳 포함` : "",
    p.votes && p.votes.best > 0 ? `우리 고객 추천 ${p.votes.best}` : "",
    p.sales && p.sales.won > 0 ? `성약 ${p.sales.won}건` : "",
    p.stayField ? `현장 실측 ${p.stayField.avg}분` : "",
    p.verified ? "직원 확인" : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

/** 지금 쓸 체류 시간 — 현장 실측(3번 이상)이 있으면 그것, 아니면 웹 값 */
export function bestStay(p: PlaceCard): number {
  return p.stayField && p.stayField.n >= 3 ? p.stayField.avg : p.stayWeb;
}

/** 두 글자씩 끊은 조각이 얼마나 겹치는지 (0~1) — "썬월드 바나힐 케이블카 & 골든 브릿지" ↔ "바나힐 & 골든브릿지" */
function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const x = grams(a.replace(/&/g, ""));
  const y = grams(b.replace(/&/g, ""));
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both += 1;
  // 짧은 쪽 기준 — 긴 정식 이름 안에 짧은 이름이 거의 다 들어 있으면 같은 곳
  return both / Math.min(x.size, y.size);
}

/** 이름으로 장소 찾기 (괄호 병기·띄어쓰기·정식 이름이 달라도) */
export function findPlace(doc: CityKnowledge, name: string): PlaceCard | undefined {
  const key = knowledgeKey(name);
  if (!key) return undefined;
  const exact = doc.places.find((p) => p.key === key) ?? doc.places.find((p) => key.length >= 3 && (p.key.includes(key) || key.includes(p.key)));
  if (exact) return exact;
  let best: { p: PlaceCard; s: number } | null = null;
  for (const p of doc.places) {
    // "시장"처럼 짧고 흔한 이름은 비슷해 보여도 다른 곳이 많아 정확히 같을 때만
    if (Math.min(p.key.length, key.length) < 3) continue;
    const s = similarity(key, p.key);
    if (s >= 0.75 && (!best || s > best.s)) best = { p, s };
  }
  return best?.p;
}

/** 코스 만들 때 AI에게 주는 지식 메모 — 점수 높은 장소·인기 코스·동반자 니즈·현장 기록 */
export function knowledgeMemo(docs: CityKnowledge[], companions: Companion[], maxPlaces = 25): string {
  const lines: string[] = [];
  for (const doc of docs) {
    if (doc.places.length === 0 && doc.courses.length === 0) continue;
    const ranked = [...doc.places].filter((p) => placeScore(p) > 0).sort((a, b) => placeScore(b) - placeScore(a));
    const fitFirst = companions.length > 0 ? [...ranked.filter((p) => p.fits.some((f) => companions.includes(f))), ...ranked.filter((p) => !p.fits.some((f) => companions.includes(f)))] : ranked;
    lines.push(`[${doc.city}] 점수 높은 순 (점수 = 후기 인기 + 다른 여행사 포함 + 우리 고객 평가 + 성약 − 직원이 뺀 곳)`);
    for (const p of fitFirst.slice(0, maxPlaces)) {
      const stay = bestStay(p);
      lines.push(
        `- ${p.name}${p.area ? ` (${p.area})` : ""} · 점수 ${placeScore(p)}${stay ? ` · 체류 ${stay}분${p.stayField && p.stayField.n >= 3 ? "(현장 실측)" : ""}` : ""}${p.fits.length ? ` · 잘 맞음: ${p.fits.join(",")}` : ""}${p.likes[0] ? ` · 좋은 점: ${p.likes.slice(0, 2).join("/")}` : ""}${p.dislikes[0] ? ` · 주의: ${p.dislikes.slice(0, 2).join("/")}` : ""}${p.fieldNotes[0] ? ` · 현장: ${p.fieldNotes[0]}` : ""}`,
      );
    }
    const avoid = doc.places.filter((p) => placeScore(p) < 0).map((p) => p.name);
    if (avoid.length) lines.push(`- 우리 고객·직원 평가가 나쁜 곳 (되도록 빼기): ${avoid.slice(0, 8).join(", ")}`);
    if (doc.courses.length) {
      lines.push(`[${doc.city}] 인기 코스`);
      for (const c of doc.courses.slice(0, 6)) lines.push(`- ${c.name}: ${c.places.join(" → ")}${c.agencies.length ? ` (여행사 ${c.agencies.length}곳)` : ""}${c.note ? ` — ${c.note}` : ""}`);
    }
    const needs = doc.needs.filter((n) => n.segment === "general" || companions.includes(n.segment as Companion));
    for (const n of needs) lines.push(`[${doc.city}] ${n.segment === "general" ? "여행자 공통" : n.segment} 니즈 — 좋아함: ${n.likes.join(", ") || "-"} / 피함: ${n.avoid.join(", ") || "-"}${n.tips.length ? ` / 챙길 것: ${n.tips.join(", ")}` : ""}`);
    const notes = doc.fieldNotes.slice(0, 5);
    if (notes.length) lines.push(`[${doc.city}] 우리 현장 기록: ${notes.map((f) => `[${f.type}] ${f.text}`).join(" / ")}`);
  }
  return lines.join("\n").slice(0, 6000);
}

/* ── 우리 자료로 배우기 ── */

function touch(doc: CityKnowledge, now: Date): CityKnowledge {
  return { ...doc, learnedCount: doc.learnedCount + 1, updatedAt: now.toISOString() };
}

/** 이름이 창고에 없으면 새 카드 (우리 자료로 처음 알게 된 곳) */
function upsert(doc: CityKnowledge, name: string, fn: (p: PlaceCard) => PlaceCard, now: Date): CityKnowledge {
  const found = findPlace(doc, name);
  const base: PlaceCard = found ?? {
    key: knowledgeKey(name),
    name: name.trim().slice(0, 80),
    area: "",
    kind: "sight",
    popularity: 0,
    seen: 0,
    agencies: [],
    fits: [],
    likes: [],
    dislikes: [],
    tips: [],
    stayWeb: 0,
    fieldNotes: [],
    sources: [],
    verified: false,
    updatedAt: now.toISOString(),
  };
  if (!base.key) return doc;
  const next = { ...fn(base), updatedAt: now.toISOString() };
  const places = found ? doc.places.map((p) => (p.key === found.key ? next : p)) : [...doc.places, next].slice(-MAX_PLACES);
  return { ...doc, places };
}

/** 현장 실측 체류 (가이드 체크 시각으로 잰 값) */
export function learnStays(doc: CityKnowledge, stays: { name: string; minutes: number }[], now = new Date()): CityKnowledge {
  let d = doc;
  for (const s of stays) {
    if (!(s.minutes >= 10 && s.minutes <= 600)) continue;
    d = upsert(d, s.name, (p) => {
      const n = (p.stayField?.n ?? 0) + 1;
      const avg = Math.round(((p.stayField?.avg ?? 0) * (n - 1) + s.minutes) / n);
      return { ...p, stayField: { avg, n } };
    }, now);
  }
  return d === doc ? doc : touch(d, now);
}

/** 고객 후기 — 좋았던 곳·아쉬운 곳 */
export function learnVotes(doc: CityKnowledge, best: string[], worst: string[], now = new Date()): CityKnowledge {
  let d = doc;
  for (const n of best.slice(0, 5)) d = upsert(d, n, (p) => ({ ...p, votes: { best: (p.votes?.best ?? 0) + 1, worst: p.votes?.worst ?? 0 } }), now);
  for (const n of worst.slice(0, 5)) d = upsert(d, n, (p) => ({ ...p, votes: { best: p.votes?.best ?? 0, worst: (p.votes?.worst ?? 0) + 1 } }), now);
  return d === doc ? doc : touch(d, now);
}

/** 판매 결과 — 성약(won) 또는 실패(lost)한 상품의 장소들 */
export function learnSale(doc: CityKnowledge, places: string[], won: boolean, now = new Date()): CityKnowledge {
  let d = doc;
  for (const n of places.slice(0, 40))
    d = upsert(d, n, (p) => ({ ...p, sales: { won: (p.sales?.won ?? 0) + (won ? 1 : 0), lost: (p.sales?.lost ?? 0) + (won ? 0 : 1) } }), now);
  return d === doc ? doc : touch(d, now);
}

/** 직원 수정 — AI가 넣은 곳을 뺐는지, 직접 넣었는지 */
export function learnEdits(doc: CityKnowledge, removed: string[], added: string[], now = new Date()): CityKnowledge {
  let d = doc;
  for (const n of removed.slice(0, 20)) d = upsert(d, n, (p) => ({ ...p, edits: { removed: (p.edits?.removed ?? 0) + 1, added: p.edits?.added ?? 0 } }), now);
  for (const n of added.slice(0, 20)) d = upsert(d, n, (p) => ({ ...p, edits: { removed: p.edits?.removed ?? 0, added: (p.edits?.added ?? 0) + 1 } }), now);
  return d === doc ? doc : touch(d, now);
}

/** 다른 여행사 상품 일정 — 장소마다 여행사를 더하고, 코스로도 남긴다 */
export function learnCompetitor(doc: CityKnowledge, agency: string, title: string, days: string[][], now = new Date()): CityKnowledge {
  let d = doc;
  const ag = agency.trim().slice(0, 40);
  if (!ag) return doc;
  for (const n of days.flat().slice(0, 60)) d = upsert(d, n, (p) => ({ ...p, agencies: uniq([...p.agencies, ag], 8) }), now);
  let courses = [...d.courses];
  for (const places of days.filter((x) => x.length >= 2).slice(0, 10)) {
    const key = knowledgeKey(places.join("-"));
    const old = courses.find((c) => c.key === key);
    if (old) courses = courses.map((c) => (c.key === key ? { ...c, agencies: uniq([...c.agencies, ag], 8) } : c));
    else courses.push({ key, name: `${title.slice(0, 40)} 하루 코스`, places: places.slice(0, 10), agencies: [ag], popularity: 50, note: `${ag} 상품 일정`, updatedAt: now.toISOString() });
  }
  return touch({ ...d, courses: courses.slice(-MAX_COURSES) }, now);
}

/** 현장 기록 (지연·일정 변경·사고 등) — 도시 기록으로 남기고, 장소 이름이 들어 있으면 그 장소 카드에도 */
export function learnFieldNotes(doc: CityKnowledge, notes: FieldNote[], now = new Date()): CityKnowledge {
  if (notes.length === 0) return doc;
  let d: CityKnowledge = { ...doc, fieldNotes: [...notes.map((n) => ({ ...n, text: n.text.slice(0, 200) })), ...doc.fieldNotes].slice(0, MAX_NOTES) };
  for (const n of notes)
    for (const p of d.places)
      if (p.name.length >= 2 && n.text.includes(p.name.replace(/\(.*?\)/g, "").trim())) d = { ...d, places: d.places.map((x) => (x.key === p.key ? { ...x, fieldNotes: uniq([`${n.type}: ${n.text}`, ...x.fieldNotes]) } : x)) };
  return touch(d, now);
}

/** 오래된 조사인지 (30일 지나면 다시 조사) */
export function isStale(doc: CityKnowledge, now = new Date(), days = 30): boolean {
  if (!doc.researchedAt) return true;
  return now.getTime() - new Date(doc.researchedAt).getTime() > days * 86_400_000;
}

/** 일정의 관광·체험·식당 이름 (항공·이동·숙소·자유시간 빼고) — 판매·후기 학습에 쓴다 */
export function coursePlaces(days: DayPlan[], pmChoice: PmChoice): string[] {
  const skip = new Set(["flight", "transfer", "hotel", "free_time"]);
  return [...new Set(days.flatMap((d) => dayItems(d, pmChoice)).filter((i) => !skip.has(i.type ?? "sightseeing") && !/점심|저녁|조식|자유식/.test(i.name)).map((i) => i.name.trim().slice(0, 80)))].slice(0, 40);
}
