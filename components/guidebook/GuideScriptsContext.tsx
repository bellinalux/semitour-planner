"use client";

import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { GuideScript } from "@/lib/guideBook";
import { draftGuide, fetchKits, GUIDEBOOK_EVENT } from "@/lib/guideBookClient";

/** 일정 화면에서 쓰는 가이드 원고 — 이 일정 도시들의 원고, 인원(집결 시간), 원고 만들기 */
export interface GuideScriptsView {
  scripts: GuideScript[];
  travelers: number;
  /** 지금 원고를 만드는 장소 이름 */
  drafting: string;
  draft: (city: string, name: string) => Promise<void>;
  error: string;
  /** 원고를 처음 펼칠 때 언어 (국내 = 외국인 손님이면 영어) */
  lang: "ko" | "en";
}

export const GuideScriptsContext = createContext<GuideScriptsView | null>(null);

/** 도시들의 원고를 불러 두고, 해설집이 바뀌면(저장·초안·불러오기) 다시 읽는다. 못 불러오면 원고 없이 */
export function useGuideScripts(cities: string[], travelers: number, lang: "ko" | "en" = "ko"): GuideScriptsView {
  const key = [...new Set(cities.map((c) => c.trim()).filter(Boolean))].sort().join(",");
  const [scripts, setScripts] = useState<GuideScript[]>([]);
  const [drafting, setDrafting] = useState("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(GUIDEBOOK_EVENT, bump);
    return () => window.removeEventListener(GUIDEBOOK_EVENT, bump);
  }, []);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    void fetchKits(key.split(","))
      .then((r) => alive && setScripts(r.kits.flatMap((k) => k.scripts)))
      .catch(() => alive && setScripts([]));
    return () => {
      alive = false;
    };
  }, [key, tick]);

  const draft = useCallback(async (city: string, name: string) => {
    setDrafting(name);
    setError("");
    try {
      await draftGuide({ kind: "script", city, name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "원고를 만들지 못했습니다.");
    } finally {
      setDrafting("");
    }
  }, []);

  return useMemo(() => ({ scripts: key ? scripts : [], travelers, drafting, draft, error, lang }), [key, scripts, travelers, drafting, draft, error, lang]);
}
