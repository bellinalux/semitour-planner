"use client";

import type { GuideBasics, GuideCityEntry, GuideCityKit, GuideScript } from "@/lib/guideBook";

/** 가이드 해설집이 바뀌면 (원고 저장·초안·불러오기) 일정 화면이 다시 읽도록 알린다 */
export const GUIDEBOOK_EVENT = "semitour:guidebook-changed";
export const notifyGuidebook = () => window.dispatchEvent(new Event(GUIDEBOOK_EVENT));

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(j.error?.message ?? "가이드 해설집을 불러오지 못했습니다.");
  return j;
}

export const fetchGuideIndex = () => call<{ cities: GuideCityEntry[]; basics: GuideBasics }>("/api/guidebook");
export const fetchKit = (city: string) => call<{ kit: GuideCityKit }>(`/api/guidebook?city=${encodeURIComponent(city)}`).then((r) => r.kit);
export const fetchKits = (cities: string[]) =>
  call<{ kits: GuideCityKit[]; basics: GuideBasics }>(`/api/guidebook?cities=${encodeURIComponent(cities.slice(0, 10).join(","))}`);

export async function patchGuide<T = { kit?: GuideCityKit; basics?: GuideBasics; added?: number; updated?: number; skipped?: number }>(body: unknown): Promise<T> {
  const r = await call<T>("/api/guidebook", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  notifyGuidebook();
  return r;
}

export async function draftGuide(body: { kind: "script" | "english"; city: string; name: string; area?: string; force?: boolean } | { kind: "phrases"; city: string }) {
  const r = await call<{ kit: GuideCityKit; kept?: boolean; searched?: boolean; language?: string }>("/api/guidebook/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  notifyGuidebook();
  return r;
}

const TEXT_LABELS = {
  ko: { intro: "한 줄 소개", points: "설명 포인트", more: "(더)", site: "현장 진행", drop: "하차", tickets: "입장", meet: "집결", restroom: "화장실", photo: "사진", cautions: "주의", faq: "자주 받는 질문", must: "꼭 외울 것" },
  en: { intro: "Intro", points: "Key points", more: "(more)", site: "On site", drop: "Drop-off", tickets: "Tickets", meet: "Meeting point", restroom: "Restroom", photo: "Photo spot", cautions: "Cautions", faq: "FAQ", must: "Must know" },
};

/** 원고 한 장을 글로 (메신저로 보내기) — 영어 원고면 영어 제목 */
export function scriptAsText(s: GuideScript, lang: "ko" | "en" = "ko"): string {
  const L = TEXT_LABELS[lang];
  const lines = [`■ ${s.name}${s.area ? ` (${s.area})` : ""}`, s.intro && `\n[${L.intro}]\n${s.intro}`];
  if (s.points.length) lines.push(`\n[${L.points}]`, ...s.points.map((p, i) => `${i + 1}. ${p.title}\n${p.text}${p.more ? `\n${L.more} ${p.more}` : ""}`));
  const site = [s.site.dropOff && `${L.drop}: ${s.site.dropOff}`, s.site.tickets && `${L.tickets}: ${s.site.tickets}`, s.site.meetPoint && `${L.meet}: ${s.site.meetPoint}`, s.site.restroom && `${L.restroom}: ${s.site.restroom}`, s.site.photo && `${L.photo}: ${s.site.photo}`].filter(Boolean);
  if (site.length) lines.push(`\n[${L.site}]`, ...site.map((x) => `· ${x}`));
  if (s.cautions.length) lines.push(`\n[${L.cautions}]`, ...s.cautions.map((c) => `· ${c}`));
  if (s.faq.length) lines.push(`\n[${L.faq}]`, ...s.faq.map((f) => `Q. ${f.q}\nA. ${f.a}`));
  if (s.mustKnow.length) lines.push(`\n[${L.must}]`, ...s.mustKnow.map((m) => `✓ ${m}`));
  return lines.filter(Boolean).join("\n");
}

/** 해설집 파일로 내려받기 */
export function downloadKit(kit: GuideCityKit) {
  const file = { kind: "semitour-guidebook", version: 1, city: kit.city, scripts: kit.scripts, phrases: kit.phrases, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(file, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `가이드해설집-${kit.city}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 상품 가이드 해설집 인쇄 언어 — 문서 칸에서 고른 것 (이 브라우저에 기억). 고른 적 없으면 국내(외국인 손님)는 영어, 해외는 한국어 */
export const GUIDE_LANG_KEY = "semitour-planner:guidebookLang";
export const GUIDE_LANG_EVENT = "semitour:guidebook-lang";
export function readGuideLang(tripScope?: string): "ko" | "en" {
  try {
    const v = localStorage.getItem(GUIDE_LANG_KEY);
    if (v === "ko" || v === "en") return v;
  } catch {
    /* 기본값 */
  }
  return tripScope === "domestic" ? "en" : "ko";
}
export function writeGuideLang(lang: "ko" | "en") {
  try {
    localStorage.setItem(GUIDE_LANG_KEY, lang);
  } catch {
    /* 무시 */
  }
  window.dispatchEvent(new Event(GUIDE_LANG_EVENT));
}
