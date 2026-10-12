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

export async function draftGuide(body: { kind: "script"; city: string; name: string; area?: string; force?: boolean } | { kind: "phrases"; city: string }) {
  const r = await call<{ kit: GuideCityKit; kept?: boolean; searched?: boolean; language?: string }>("/api/guidebook/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  notifyGuidebook();
  return r;
}

/** 원고 한 장을 글로 (메신저로 보내기) */
export function scriptAsText(s: GuideScript): string {
  const lines = [`■ ${s.name}${s.area ? ` (${s.area})` : ""}`, s.intro && `\n[한 줄 소개]\n${s.intro}`];
  if (s.points.length) lines.push("\n[설명 포인트]", ...s.points.map((p, i) => `${i + 1}. ${p.title}\n${p.text}${p.more ? `\n(더) ${p.more}` : ""}`));
  const site = [s.site.dropOff && `하차: ${s.site.dropOff}`, s.site.tickets && `입장: ${s.site.tickets}`, s.site.meetPoint && `집결: ${s.site.meetPoint}`, s.site.restroom && `화장실: ${s.site.restroom}`, s.site.photo && `사진: ${s.site.photo}`].filter(Boolean);
  if (site.length) lines.push("\n[현장 진행]", ...site.map((x) => `· ${x}`));
  if (s.cautions.length) lines.push("\n[주의]", ...s.cautions.map((c) => `· ${c}`));
  if (s.faq.length) lines.push("\n[자주 받는 질문]", ...s.faq.map((f) => `Q. ${f.q}\nA. ${f.a}`));
  if (s.mustKnow.length) lines.push("\n[꼭 외울 것]", ...s.mustKnow.map((m) => `✓ ${m}`));
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
