import { z } from "zod";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { citiesOf, knowledgeKey } from "@/lib/knowledge";
import type { DayPlan } from "@/types";

/**
 * 가이드 해설집 — 장소마다 가이드 설명 원고(한 줄 소개·핵심 포인트·현장 진행·주의·자주 받는 질문·고객 유형별 강조)와
 * 초보 가이드 교육 자료(진행 멘트·기본기·비상 대응·상품 원칙), 도시별 현지 회화.
 * 원고의 말하는 시간으로 "설명 시간"을 계산해 체류 시간 구성(하차·대기·설명·관람·집결)에 쓴다.
 * 회사(작업 공간)별로 서버에 저장하고, 직원이 검수 완료한 원고는 AI 초안이 덮어쓰지 않는다.
 */

const str = (n: number) => z.string().max(n);

/* ── AI 초안 형식 (모델에게 보여 주는 스키마) ── */

export const guidePointSchema = z.object({
  title: z.string().describe("포인트 제목 (예: 왕궁이 지어진 이야기)"),
  text: z.string().describe("가이드가 그대로 말할 수 있는 설명 2~4문장 (기본 버전)"),
  more: z.string().describe("시간이 있을 때 덧붙일 이야기 1~3문장 (자세히 버전). 없으면 빈 문자열"),
});

export const guideDraftSchema = z.object({
  intro: z.string().describe("버스에서 도착 전에 30초로 말하는 한 줄 소개 (1~2문장)"),
  points: z.array(guidePointSchema).describe("핵심 설명 포인트 3~6개 — 역사·이야기·볼거리 순, 가장 중요한 것부터"),
  site: z.object({
    dropOff: z.string().describe("버스 하차·승차 위치 (모르면 빈 문자열)"),
    tickets: z.string().describe("매표·입장 방법 (단체 입장, 예약, 신분증 등. 모르면 빈 문자열)"),
    meetPoint: z.string().describe("관람 뒤 다시 모이기 좋은 곳 (모르면 빈 문자열)"),
    restroom: z.string().describe("화장실 위치 (모르면 빈 문자열)"),
    photo: z.string().describe("사진 찍기 좋은 곳 (모르면 빈 문자열)"),
  }),
  cautions: z.array(z.string()).describe("주의 사항 2~5개 (복장 규정, 소지품, 더위·계단, 금지 행동, 소매치기 등)"),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).describe("고객이 자주 묻는 질문과 짧은 답 2~5개"),
  audience: z.object({
    family: z.string().describe("아이 동반 가족에게 강조할 점 한 문장"),
    senior: z.string().describe("시니어에게 강조·배려할 점 한 문장"),
    student: z.string().describe("학생 단체에게 강조할 점 한 문장"),
    couple: z.string().describe("커플·신혼에게 강조할 점 한 문장"),
  }),
  viewMin: z.number().describe("설명을 들은 뒤 자유 관람·사진에 보통 쓰는 시간(분)"),
  waitMin: z.number().describe("매표·입장 대기·검색대 등 보통 기다리는 시간(분). 없으면 0"),
  mustKnow: z.array(z.string()).describe("초보 가이드가 꼭 외워야 할 사실 3개 (연도·높이·이름 등 짧게)"),
});
export type GuideDraft = z.infer<typeof guideDraftSchema>;

/* ── 저장 형식 ── */

const siteSchema = z.object({ dropOff: str(400), tickets: str(400), meetPoint: str(400), restroom: str(400), photo: str(400) });
const emptySite = { dropOff: "", tickets: "", meetPoint: "", restroom: "", photo: "" };
const emptyAudience = { family: "", senior: "", student: "", couple: "" };

/** 영어 원고 — 한국어 원고(검수한 사실)를 외국인 손님에게 말하는 자연스러운 영어로 다시 쓴 것. 검수는 따로 */
export const englishScriptSchema = z.object({
  intro: str(700).default(""),
  points: z.array(z.object({ title: str(160), text: str(2000), more: str(2000).default("") })).max(8).default([]),
  site: siteSchema.default(emptySite),
  cautions: z.array(str(400)).max(8).default([]),
  faq: z.array(z.object({ q: str(300), a: str(800) })).max(8).default([]),
  audience: z.object({ family: str(400), senior: str(400), student: str(400), couple: str(400) }).default(emptyAudience),
  mustKnow: z.array(str(300)).max(5).default([]),
  status: z.enum(["draft", "reviewed"]).default("draft"),
  updatedAt: str(40).default(""),
  updatedBy: str(40).default(""),
});
export type EnglishScript = z.infer<typeof englishScriptSchema>;
export type GuideLang = "ko" | "en";
export const LANG_LABEL: Record<GuideLang, string> = { ko: "한국어", en: "English" };

export const guideScriptSchema = z.object({
  key: str(80),
  city: str(60),
  name: str(80).min(1),
  area: str(60).default(""),
  intro: str(400).default(""),
  points: z.array(z.object({ title: str(80), text: str(1200), more: str(1200).default("") })).max(8).default([]),
  site: siteSchema.default(emptySite),
  cautions: z.array(str(240)).max(8).default([]),
  faq: z.array(z.object({ q: str(200), a: str(500) })).max(8).default([]),
  audience: z.object({ family: str(240), senior: str(240), student: str(240), couple: str(240) }).default(emptyAudience),
  viewMin: z.number().int().min(0).max(480).default(30),
  waitMin: z.number().int().min(0).max(240).default(0),
  mustKnow: z.array(str(200)).max(5).default([]),
  sources: z.array(z.object({ title: str(200), url: str(500) })).max(10).default([]),
  status: z.enum(["draft", "reviewed"]).default("draft"),
  updatedAt: str(40).default(""),
  updatedBy: str(40).default(""),
  en: englishScriptSchema.optional(),
});
export type GuideScript = z.infer<typeof guideScriptSchema>;

/** 이 언어로 본 원고 (영어 원고가 없으면 null) — 장소 이름·대기·관람 시간은 공통 */
export function scriptIn(s: GuideScript, lang: GuideLang): GuideScript | null {
  if (lang === "ko") return s;
  if (!s.en) return null;
  const e = s.en;
  return { ...s, intro: e.intro, points: e.points, site: e.site, cautions: e.cautions, faq: e.faq, audience: e.audience, mustKnow: e.mustKnow, status: e.status, updatedAt: e.updatedAt, updatedBy: e.updatedBy };
}

/** 영어로 고친 내용(원고 모양)을 영어 원고 칸에 담는다 */
export function englishFrom(view: GuideScript, status: EnglishScript["status"], updatedAt: string, updatedBy: string): EnglishScript {
  return englishScriptSchema.parse({ intro: view.intro, points: view.points, site: view.site, cautions: view.cautions, faq: view.faq, audience: view.audience, mustKnow: view.mustKnow, status, updatedAt, updatedBy });
}

/* ── 영어 원고 AI 형식 ── */

export const englishDraftSchema = z.object({
  intro: z.string().describe("30-second bus intro before arrival, 1-2 sentences"),
  points: z.array(z.object({ title: z.string(), text: z.string().describe("2-4 spoken sentences"), more: z.string().describe("extra story for the long version, or empty") })).describe("same points in the same order"),
  site: z.object({ dropOff: z.string(), tickets: z.string(), meetPoint: z.string(), restroom: z.string(), photo: z.string() }),
  cautions: z.array(z.string()),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  audience: z.object({ family: z.string(), senior: z.string(), student: z.string(), couple: z.string() }),
  mustKnow: z.array(z.string()),
});

export const phraseSchema = z.object({ ko: str(80), local: str(120), say: str(120) });
export type Phrase = z.infer<typeof phraseSchema>;

export interface GuideCityKit {
  city: string;
  scripts: GuideScript[];
  phrases: Phrase[];
  updatedAt: string;
}

export interface GuideCityEntry {
  city: string;
  scripts: number;
  reviewed: number;
  updatedAt: string;
}

export function emptyKit(city: string): GuideCityKit {
  return { city, scripts: [], phrases: [], updatedAt: "" };
}

export const scriptKey = (name: string) => knowledgeKey(name);

/** AI 초안 → 저장 형식 (검수 전 초안) */
export function scriptFromDraft(city: string, name: string, draft: GuideDraft, sources: { title: string; url: string }[], area = ""): GuideScript {
  const clip = (s: string, n: number) => (s ?? "").trim().slice(0, n);
  return guideScriptSchema.parse({
    key: scriptKey(name),
    city,
    name: clip(name, 80),
    area: clip(area, 60),
    intro: clip(draft.intro, 400),
    points: draft.points.slice(0, 6).map((p) => ({ title: clip(p.title, 80), text: clip(p.text, 1200), more: clip(p.more, 1200) })),
    site: { dropOff: clip(draft.site.dropOff, 240), tickets: clip(draft.site.tickets, 240), meetPoint: clip(draft.site.meetPoint, 240), restroom: clip(draft.site.restroom, 240), photo: clip(draft.site.photo, 240) },
    cautions: draft.cautions.slice(0, 6).map((c) => clip(c, 240)),
    faq: draft.faq.slice(0, 6).map((f) => ({ q: clip(f.q, 200), a: clip(f.a, 500) })),
    audience: { family: clip(draft.audience.family, 240), senior: clip(draft.audience.senior, 240), student: clip(draft.audience.student, 240), couple: clip(draft.audience.couple, 240) },
    viewMin: Math.max(0, Math.min(480, Math.round(draft.viewMin || 30))),
    waitMin: Math.max(0, Math.min(240, Math.round(draft.waitMin || 0))),
    mustKnow: draft.mustKnow.slice(0, 3).map((m) => clip(m, 200)),
    sources: sources.slice(0, 8).map((s) => ({ title: clip(s.title, 200), url: clip(s.url, 500) })),
    status: "draft",
    updatedAt: new Date().toISOString(),
  });
}

/** 원고를 도시 해설집에 넣는다 — 같은 장소가 검수 완료면 초안으로 덮지 않는다 (force면 덮는다) */
export function upsertScript(kit: GuideCityKit, script: GuideScript, force = false): { kit: GuideCityKit; kept: boolean } {
  const cur = kit.scripts.find((s) => s.key === script.key);
  if (cur && cur.status === "reviewed" && script.status === "draft" && !force) return { kit, kept: true };
  // 한국어 원고를 AI로 다시 만들면 영어 원고는 남기되 다시 검수하도록 초안으로 돌린다
  const next = !script.en && cur?.en ? { ...script, en: { ...cur.en, status: "draft" as const } } : script;
  const scripts = cur ? kit.scripts.map((s) => (s.key === script.key ? next : s)) : [...kit.scripts, next];
  return { kit: { ...kit, scripts: scripts.slice(0, 300), updatedAt: new Date().toISOString() }, kept: false };
}

/** 파일로 불러온 해설집 합치기 — 검수 완료는 더 새 것이 이기고, 우리 쪽 검수 완료를 남의 초안이 덮지 않는다 */
export function mergeKit(cur: GuideCityKit, incoming: { scripts: Record<string, unknown>[]; phrases?: Record<string, unknown>[] }): { kit: GuideCityKit; added: number; updated: number; skipped: number } {
  let kit = cur;
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const raw of incoming.scripts) {
    const parsed = guideScriptSchema.safeParse({ ...raw, city: cur.city, key: scriptKey(typeof raw.name === "string" ? raw.name : "") });
    if (!parsed.success || !parsed.data.key) {
      skipped++;
      continue;
    }
    const s = parsed.data;
    const mine = kit.scripts.find((x) => x.key === s.key);
    if (mine && (mine.status === "reviewed" && s.status !== "reviewed" ? true : mine.updatedAt >= s.updatedAt)) {
      skipped++;
      continue;
    }
    kit = upsertScript(kit, s, true).kit;
    if (mine) updated++;
    else added++;
  }
  const phrases =
    cur.phrases.length > 0
      ? cur.phrases
      : (incoming.phrases ?? [])
          .flatMap((p) => {
            const r = phraseSchema.safeParse(p);
            return r.success ? [r.data] : [];
          })
          .slice(0, 40);
  return { kit: { ...kit, phrases }, added, updated, skipped };
}

/* ── 말하는 시간·체류 구성 ── */

/** 단체 앞에서 말하는 속도 — 1분에 약 250자 (띄어쓰기 빼고, 쉼·질문 포함) */
export const CHARS_PER_MIN = 250;
const chars = (s: string) => s.replace(/\s/g, "").length;

/** 말하는 시간(초) */
/** 영어는 1분에 약 130단어 (단체 앞 안내 속도) */
export const WORDS_PER_MIN = 130;

/** 말하는 시간(초) — 한글이 많으면 글자 수, 영어면 단어 수로 */
export function speakSeconds(text: string): number {
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  if (hangul >= chars(text) * 0.2) return Math.round((chars(text) / CHARS_PER_MIN) * 60);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / WORDS_PER_MIN) * 60);
}

export type ScriptLength = "short" | "basic" | "long";
export const LENGTH_LABEL: Record<ScriptLength, string> = { short: "짧게", basic: "기본", long: "자세히" };

/** 길이별 원고 — 짧게: 소개 + 앞 포인트 2개 / 기본: 소개 + 모든 포인트 / 자세히: 기본 + 덧붙일 이야기 */
export function scriptText(s: Pick<GuideScript, "intro" | "points">, length: ScriptLength): string {
  const pts = length === "short" ? s.points.slice(0, 2) : s.points;
  return [s.intro, ...pts.map((p) => (length === "long" && p.more ? `${p.text} ${p.more}` : p.text))].filter(Boolean).join("\n");
}

/** 길이별 설명 시간(분, 1분 단위 올림) */
export function explainMinutes(s: Pick<GuideScript, "intro" | "points">, length: ScriptLength = "basic"): number {
  const sec = speakSeconds(scriptText(s, length));
  return sec === 0 ? 0 : Math.max(1, Math.ceil(sec / 60));
}

/** 하차·집결·재집결·탑승 — 인원이 많을수록 길다 (업계 감각: 소규모 10분, 15명↑ 15분, 30명↑ 20분) */
export function gatherMinutes(travelers: number): number {
  return travelers >= 30 ? 20 : travelers >= 15 ? 15 : 10;
}

export interface StayBreakdown {
  wait: number;
  explain: number;
  view: number;
  gather: number;
  total: number;
}

/** 체류 시간 구성 = 대기 + 설명(기본 원고) + 자유 관람 + 하차·집결 → 5분 단위 */
export function stayBreakdown(s: Pick<GuideScript, "intro" | "points" | "viewMin" | "waitMin">, travelers: number): StayBreakdown {
  const wait = s.waitMin;
  const explain = explainMinutes(s, "basic");
  const view = s.viewMin;
  const gather = gatherMinutes(travelers);
  const total = Math.ceil((wait + explain + view + gather) / 5) * 5;
  return { wait, explain, view, gather, total };
}

/* ── 일정 항목과 원고 짝짓기 ── */

/** 일정 항목 이름에 맞는 원고 — 같은 이름 먼저, 없으면 한쪽 이름이 다른 쪽에 들어 있는 것(2글자 이상) 중 가장 긴 것 */
export function findScript(scripts: GuideScript[], itemName: string): GuideScript | null {
  const k = scriptKey(itemName);
  if (!k) return null;
  const exact = scripts.find((s) => s.key === k);
  if (exact) return exact;
  const hits = scripts.filter((s) => s.key.length >= 2 && (k.includes(s.key) || (k.length >= 2 && s.key.includes(k))));
  return hits.sort((a, b) => b.key.length - a.key.length)[0] ?? null;
}

const NOT_SCRIPT = new Set(["flight", "transfer", "hotel", "free_time", "meal"]);

/** 일정의 도시별 장소 이름 (원고를 쓸 곳 — 항공·이동·숙소·자유시간·식사 제외) */
export function tripPlacesByCity(days: DayPlan[], pmChoice: PmChoice, destination: string): Record<string, string[]> {
  const fallback = citiesOf(destination)[0] ?? destination.trim();
  const out: Record<string, string[]> = {};
  for (const d of days) {
    const city = (d.overnightCity ?? "").trim() || fallback;
    if (!city) continue;
    for (const it of dayItems(d, pmChoice)) {
      if (NOT_SCRIPT.has(it.type ?? "sightseeing")) continue;
      const list = (out[city] ??= []);
      if (!list.some((n) => knowledgeKey(n) === knowledgeKey(it.name))) list.push(it.name);
    }
  }
  return out;
}

/* ── 교육 자료 (회사 공용, 직원이 고칠 수 있다) ── */

export interface BasicsSection {
  id: string;
  group: "멘트" | "기본기" | "비상 대응" | "상품 원칙";
  title: string;
  lines: string[];
}

export interface GuideBasics {
  sections: BasicsSection[];
  updatedAt: string;
  updatedBy: string;
}

export const basicsSchema = z.object({
  sections: z
    .array(z.object({ id: str(40), group: z.enum(["멘트", "기본기", "비상 대응", "상품 원칙"]), title: str(60), lines: z.array(str(400)).max(20) }))
    .max(30),
});

export const DEFAULT_BASICS: BasicsSection[] = [
  {
    id: "airport",
    group: "멘트",
    title: "공항 미팅 인사",
    lines: [
      "안녕하세요, ○○여행 인솔(가이드) ○○○입니다. 먼 길 오시느라 고생 많으셨습니다.",
      "먼저 인원 확인하겠습니다. 이름 부르면 손 한 번만 들어 주세요.",
      "짐은 모두 챙기셨나요? 여권과 휴대폰은 꼭 몸에 지니세요.",
      "화장실 다녀오실 분은 지금 다녀오시고, ○시 ○분까지 이 자리로 모여 주세요.",
    ],
  },
  {
    id: "bus",
    group: "멘트",
    title: "버스 첫 안내",
    lines: [
      "기사님 소개 — 이번 여행 내내 안전하게 모셔 주실 ○○○ 기사님입니다. 박수 부탁드립니다.",
      "오늘 일정 순서와 식사·호텔 도착 예상 시각을 먼저 말씀드리겠습니다.",
      "버스가 움직이는 동안은 안전벨트를 매 주시고, 자리에서 일어나지 마세요.",
      "현지 시각은 한국보다 ○시간 느립니다. 휴대폰 시각을 확인해 주세요.",
      "비상 연락처(가이드·회사)는 단체방에 올려 두었습니다.",
    ],
  },
  {
    id: "move",
    group: "멘트",
    title: "이동 중 다음 장소 예고",
    lines: [
      "다음 장소까지 약 ○분 걸립니다. 도착하면 ○분 정도 둘러봅니다.",
      "도착 전에 한 줄 소개 → 볼거리 → 주의 사항(복장·소지품) 순서로 짧게 안내합니다.",
      "내리실 때 집결 시각과 장소를 두 번 말하고, 버스 번호·차량 사진을 단체방에 올립니다.",
    ],
  },
  {
    id: "meal",
    group: "멘트",
    title: "식당 안내",
    lines: [
      "오늘 식사는 ○○(메뉴)입니다. 음료는 개별 계산입니다(포함이면 포함이라고 안내).",
      "알레르기·못 드시는 음식이 있으면 미리 말씀해 주세요.",
      "식사 시간은 약 ○분, ○시 ○분에 버스로 모입니다.",
    ],
  },
  {
    id: "hotel",
    group: "멘트",
    title: "호텔 체크인 안내",
    lines: [
      "방 열쇠를 나눠 드리겠습니다. 방 번호를 단체방에 올려 주세요.",
      "조식 시간·장소, 내일 미팅 시각(로비 ○시 ○분)을 안내합니다.",
      "객실 냉장고·유료 TV 등은 개별 계산입니다. 귀중품은 금고에 보관하세요.",
      "문제가 있으면 바로 가이드에게 연락 주세요.",
    ],
  },
  {
    id: "farewell",
    group: "멘트",
    title: "마지막 날 인사",
    lines: [
      "여권·항공권(전자) 확인, 방에 두고 온 물건 없는지 다시 확인해 주세요.",
      "공항 도착 후 탑승 수속 순서와 집결 위치를 안내합니다.",
      "함께해 주셔서 감사했습니다. 후기를 남겨 주시면 큰 힘이 됩니다.",
    ],
  },
  {
    id: "headcount",
    group: "기본기",
    title: "인원 확인·집결",
    lines: [
      "내릴 때·탈 때 매번 인원을 셉니다 (명단 순서대로, 가족 단위로 세면 빠름).",
      "집결 시각은 정각이 아닌 '○시 ○분'으로 정하고, 두 번 말한 뒤 단체방에 글로 남깁니다.",
      "집결 장소는 눈에 띄는 표지(입구 표지판·동상 등)로 정하고 사진을 공유합니다.",
      "출발 전 시계를 맞추고(현지 시각), 가이드 깃발·표식을 알려 줍니다.",
    ],
  },
  {
    id: "late",
    group: "기본기",
    title: "늦는 손님 대응",
    lines: [
      "집결 5분 지나면 전화·단체방으로 연락, 같은 일행에게 위치를 묻습니다.",
      "10분 이상이면 다른 손님께 양해를 구하고, 남아서 기다릴지·다음 장소에서 만날지 정합니다 (혼자 두고 가지 않음).",
      "반복되면 다음 집결부터 그 일행 옆에서 시간을 다시 알려 줍니다.",
    ],
  },
  {
    id: "lost",
    group: "비상 대응",
    title: "분실 (여권·지갑·휴대폰)",
    lines: [
      "마지막으로 본 장소를 함께 확인하고 바로 되돌아가 찾습니다.",
      "여권 분실: 가까운 경찰서에서 분실 신고서(Police Report) 발급 → 대한민국 대사관·영사관에서 여행증명서(긴급 여권) 신청 (사진 2장, 신분 확인 서류, 귀국 항공편 필요).",
      "카드 분실: 카드사에 바로 정지 요청. 여행자보험 처리를 위해 신고서·영수증을 보관합니다.",
      "회사 비상연락처로 바로 보고합니다 (시각·장소·조치 기록).",
    ],
  },
  {
    id: "injury",
    group: "비상 대응",
    title: "부상·환자",
    lines: [
      "의식·호흡·출혈부터 확인하고, 위급하면 현지 응급번호로 바로 신고합니다.",
      "가까운 병원으로 이동 — 동반 가족·회사에 연락, 다른 손님 일정은 회사와 상의해 정합니다.",
      "여행자보험 처리를 위해 진단서·진료비 영수증·약 영수증을 모두 받습니다.",
      "더위·탈수: 그늘·물·휴식. 시니어·아이는 미리 쉬는 시간을 넣습니다.",
    ],
  },
  {
    id: "delay",
    group: "비상 대응",
    title: "일정 지연·날씨 변경",
    lines: [
      "지연이 예상되면 먼저 손님께 이유와 바뀌는 일정을 설명합니다.",
      "일정을 바꾸거나 빼면 손님 동의를 받고(표준약관), 현장 기록에 시각과 함께 남깁니다.",
      "비·폭염이면 실내 대체 일정으로 바꾸고, 대체 일정·환불 여부는 회사와 확인합니다.",
      "항공 지연은 항공사 안내를 확인해 호텔·차량·식사 시각을 다시 맞춥니다.",
    ],
  },
  {
    id: "principles",
    group: "상품 원칙",
    title: "쇼핑·선택관광·가이드 경비 안내",
    lines: [
      "노쇼핑 상품이면 쇼핑센터 방문·권유를 하지 않습니다 (손님이 원하면 자유시간에 안내만).",
      "노옵션 상품이면 선택관광을 권하지 않습니다. 선택관광이 있는 상품은 참여하지 않는 손님의 대체 일정·대기 장소를 함께 안내합니다.",
      "선택관광 안내 예: '원하시는 분만 참여하시면 되고, 참여하지 않으시면 ○○에서 자유시간입니다. 가격은 1인 ○○입니다.'",
      "가이드·기사 경비: 상품가 포함이면 따로 받지 않습니다. 현지 지불이면 출발 전 안내한 금액만 첫날 안내합니다.",
    ],
  },
];

/** 저장된 교육 자료가 없거나 일부만 있으면 기본 자료로 채운다 */
export function withDefaultBasics(saved: Partial<GuideBasics> | null): GuideBasics {
  const sections = Array.isArray(saved?.sections) && saved.sections.length > 0 ? saved.sections : DEFAULT_BASICS;
  const missing = DEFAULT_BASICS.filter((d) => !sections.some((s) => s.id === d.id));
  return { sections: [...sections, ...missing], updatedAt: saved?.updatedAt ?? "", updatedBy: saved?.updatedBy ?? "" };
}

export const BASICS_GROUPS: BasicsSection["group"][] = ["멘트", "기본기", "비상 대응", "상품 원칙"];

/* ── 현지 회화 AI 형식 ── */

export const phrasesDraftSchema = z.object({
  language: z.string().describe("현지 언어 이름 (예: 태국어)"),
  phrases: z
    .array(
      z.object({
        ko: z.string().describe("한국어 뜻 (예: 안녕하세요)"),
        local: z.string().describe("현지어 표기"),
        say: z.string().describe("한글로 적은 발음"),
      }),
    )
    .describe("가이드·손님이 자주 쓰는 표현 15~20개 (인사, 감사, 숫자 1~10, 얼마예요, 화장실, 물, 도와주세요, 병원, 경찰 등)"),
});

/** 해설집 파일 (내보내기·불러오기) */
export const kitFileSchema = z.object({
  kind: z.literal("semitour-guidebook"),
  version: z.literal(1),
  city: str(60).min(1),
  scripts: z.array(z.record(z.string(), z.unknown())).max(300),
  phrases: z.array(z.record(z.string(), z.unknown())).max(60).default([]),
  exportedAt: str(40),
});
