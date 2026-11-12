"use client";

import { useState } from "react";
import { postJson } from "@/lib/api";
import { englishTexts } from "@/lib/englishDoc";
import type { DocLang } from "@/lib/foreignDoc";
import { tripPlacesByCity, type GuideBasics, type GuideCityKit } from "@/lib/guideBook";
import { fetchKits } from "@/lib/guideBookClient";
import type { TravelInfo } from "@/lib/schemas/travelInfo";
import type { PmChoice } from "@/lib/itinerary";
import type { DayPlan, TripInput } from "@/types";

const NO_WORDS: Record<string, string> = {};

/** englishTexts가 읽는 문서 데이터 (PlannerApp의 docData) */
type DocDataForTexts = Parameters<typeof englishTexts>[0];

/**
 * 인쇄·공유 문서를 만들기 전에 필요한 준비물 — 번역표, 여행 정보, 가이드 해설집 자료.
 * PlannerApp에서 떼어 낸 부분으로, 상태와 "필요할 때 한 번만 불러오기"를 한곳에 모은다.
 */
export function useDocPrep(input: TripInput) {
  // 외국어 일정표·견적서용 번역 (한글 글 → 외국어, 이 화면에서 모아 둔다)
  const [translationsByLang, setTranslationsByLang] = useState<Partial<Record<DocLang, Record<string, string>>>>({});
  const [busy, setBusy] = useState(0);
  // 일정표 「여행 정보」 (시차·전압·통화·입국·긴급 연락처) — 일정표를 인쇄할 때 한 번 찾는다
  const [travelInfo, setTravelInfo] = useState<{ key: string; info: TravelInfo } | null>(null);
  // 가이드 해설집 인쇄용 — 이 일정 도시들의 원고·교육 자료 (인쇄 직전에 불러온다)
  const [guideDocData, setGuideDocData] = useState<{ kits: GuideCityKit[]; basics: GuideBasics } | null>(null);

  const track = async <T,>(job: () => Promise<T>): Promise<T> => {
    setBusy((n) => n + 1);
    try {
      return await job();
    } finally {
      setBusy((n) => n - 1);
    }
  };

  /** 아직 번역하지 않은 한글 글을 번역해 번역표를 돌려준다 (실패하면 null) */
  const ensureForeign = async (docData: DocDataForTexts | null, lang: DocLang, info?: TravelInfo | null): Promise<Record<string, string> | null> => {
    if (!docData) return null;
    const have = translationsByLang[lang] ?? {};
    const texts = englishTexts({ ...docData, travelInfo: info ?? docData.travelInfo }).filter((t) => !(t in have));
    if (texts.length === 0) return have;
    return track(async () => {
      try {
        const r = await postJson<{ translations: string[] }>("/api/translate-doc", { texts, lang });
        const next = { ...have, ...Object.fromEntries(texts.map((t, i) => [t, r.translations[i] ?? t])) };
        setTranslationsByLang((prev) => ({ ...prev, [lang]: next }));
        return next;
      } catch {
        return null;
      }
    });
  };

  /** 일정표 여행 정보 — 같은 여행지는 한 번만 (서버가 30일 보관). 못 찾아도 인쇄는 한다 */
  const ensureTravelInfo = async (): Promise<TravelInfo | null> => {
    const dest = input.destination.trim();
    if (!dest) return null;
    if (travelInfo?.key === dest) return travelInfo.info;
    return track(async () => {
      try {
        const info = await postJson<TravelInfo>("/api/travel-info", { destination: dest, month: /^\d{4}-\d{2}/.test(input.departureDate) ? input.departureDate.slice(0, 7) : "" });
        setTravelInfo({ key: dest, info });
        return info;
      } catch {
        /* 여행 정보 없이 인쇄 */
        return null;
      }
    });
  };

  /** 가이드 해설집 자료를 불러온다. 실패하면 오류 문장 */
  const loadGuideKits = async (days: DayPlan[], pmChoice: PmChoice): Promise<string | null> => {
    try {
      setGuideDocData(await fetchKits(Object.keys(tripPlacesByCity(days, pmChoice, input.destination))));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "가이드 해설집을 불러오지 못했습니다.";
    }
  };

  return {
    translationsByLang,
    translations: translationsByLang.en ?? NO_WORDS,
    translating: busy > 0,
    /** 지금 여행지의 여행 정보 (다른 여행지 것이면 null) */
    travelInfo: travelInfo?.key === input.destination.trim() ? travelInfo.info : null,
    guideDocData,
    ensureForeign,
    ensureTravelInfo,
    loadGuideKits,
  };
}
