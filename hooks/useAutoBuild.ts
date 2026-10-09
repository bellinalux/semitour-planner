"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import { hotelCities, hotelPatch, lodgingDecided, pickHotel, pickTours, vehicleClassFor, type HotelPick } from "@/lib/autoBuild";
import { budgetPlan } from "@/lib/budget";
import { sumItineraryCosts } from "@/lib/cost";
import { overnightNights, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, HotelCandidate, TourCandidate, TripInput } from "@/types";

export type BuildStepKey = "course" | "hotel" | "quote" | "tours";
export type BuildStepStatus = "pending" | "running" | "done" | "skipped" | "error";

export interface BuildStep {
  key: BuildStepKey;
  label: string;
  status: BuildStepStatus;
  message: string;
}

const STEPS: Pick<BuildStep, "key" | "label">[] = [
  { key: "course", label: "코스 만들기" },
  { key: "hotel", label: "숙소 고르기 (예산 안)" },
  { key: "quote", label: "차량·가이드·입장료·시세·경쟁 상품" },
  { key: "tours", label: "추천 투어" },
];

const initial = (): BuildStep[] => STEPS.map((s) => ({ ...s, status: "pending", message: "" }));
const TOUR_CATEGORIES_FOR_BUILD = ["city", "night", "activity"] as const;

interface Options {
  input: TripInput;
  update: (patch: Partial<TripInput>) => void;
  days: DayPlan[];
  pmChoice: PmChoice;
  /** 코스가 없으면 만든다. 만든 일정(실패하면 null) */
  generate: () => Promise<DayPlan[] | null>;
  /** 자동 견적(빈 값 채우기) */
  runAutoQuote: () => Promise<void>;
}

/** 도시별 숙소 후보와 고른 숙소 (다른 후보로 바꿀 수 있게 남겨 둔다) */
export interface HotelChoice {
  city: string;
  candidates: HotelCandidate[];
  picked: HotelPick | null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 자동 구성 — 버튼 하나로 코스 → 숙소(예산 안) → 차량·가이드·입장료·시세·경쟁 상품 → 추천 투어까지.
 * 판매가·도매가에서 시작한 견적이면 원가 예산의 고르기 기준(1실 1박 상한, 1인 입장·투어 예산)을 지킨다.
 * 사람이 직접 정한 값(확정)은 바꾸지 않는다.
 */
export function useAutoBuild({ input, update, days, pmChoice, generate, runAutoQuote }: Options) {
  const [steps, setSteps] = useState<BuildStep[]>(initial);
  const [running, setRunning] = useState(false);
  const [hotelChoices, setHotelChoices] = useState<HotelChoice[]>([]);
  const [tours, setTours] = useState<TourCandidate[]>([]);

  // 코스를 만들고 나면 일정·입력이 바뀌므로, 다음 단계는 늘 최신 값을 읽는다
  const latest = useRef({ input, days, pmChoice, runAutoQuote, update });
  useEffect(() => {
    latest.current = { input, days, pmChoice, runAutoQuote, update };
  }, [input, days, pmChoice, runAutoQuote, update]);

  const set = (key: BuildStepKey, status: BuildStepStatus, message = "") => setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status, message } : s)));

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setSteps(initial());
    setHotelChoices([]);
    setTours([]);
    try {
      // 1. 코스
      if (latest.current.days.length > 0) set("course", "skipped", `만들어 둔 ${latest.current.days.length}일 코스를 씁니다`);
      else {
        set("course", "running");
        const made = await generate();
        if (!made || made.length === 0) {
          set("course", "error", "코스를 만들지 못했습니다");
          return;
        }
        for (let i = 0; i < 50 && latest.current.days.length === 0; i++) await wait(100);
        set("course", "done", `${made.length}일 코스`);
      }

      // 2. 숙소 (예산 상한 안에서)
      const inputNow = latest.current.input;
      if (inputNow.packageType === "land") set("hotel", "skipped", "랜드만 판매");
      else if (lodgingDecided(inputNow)) set("hotel", "skipped", "직접 정한 숙박 요금을 씁니다");
      else {
        set("hotel", "running");
        const cap = budgetPlan(inputNow, null)?.caps.roomPerNight ?? null;
        const cities = hotelCities(inputNow, overnightNights(latest.current.days));
        const results = await Promise.all(
          cities.map(async (city) => {
            try {
              const r = await postJson<{ hotels: HotelCandidate[] }>("/api/find-hotels", {
                destination: city,
                grade: inputNow.hotelGrade,
                lodgingType: inputNow.lodgingType,
                preferences: inputNow.hotelPreferences,
                currency: inputNow.currency,
                maxNightly: cap ?? 0,
              });
              return { city, candidates: r.hotels, picked: pickHotel(r.hotels, cap) };
            } catch {
              return { city, candidates: [], picked: null };
            }
          }),
        );
        setHotelChoices(results);
        const picks = Object.fromEntries(results.filter((r) => r.picked).map((r) => [r.city, r.picked!]));
        if (Object.keys(picks).length === 0) set("hotel", "error", "숙소 후보를 찾지 못했습니다 — 시세로 추정합니다");
        else {
          latest.current.update(hotelPatch(latest.current.input, picks, cities.length >= 2));
          const over = Object.values(picks).some((p) => p.overBudget);
          set(
            "hotel",
            over ? "error" : "done",
            Object.values(picks)
              .map((p) => p.hotel.name)
              .join(", ") + (over ? " — 예산 안의 숙소가 없어 가장 싼 곳을 골랐습니다" : cap ? ` (1실 1박 상한 ${cap.toLocaleString("ko-KR")} 안)` : ""),
          );
        }
      }

      // 3·4. 견적 채우기와 추천 투어는 서로 기다리지 않는다
      await wait(150); // 숙소 반영이 화면에 들어온 뒤 자동 견적이 최신 값을 읽게
      const quote = (async () => {
        set("quote", "running", `차종: ${vehicleClassFor(latest.current.input.travelers)}`);
        try {
          await latest.current.runAutoQuote();
          set("quote", "done", "아래 자동 견적 단계에 결과가 있습니다");
        } catch {
          set("quote", "error", "일부를 채우지 못했습니다");
        }
      })();
      const tourStep = (async () => {
        set("tours", "running");
        try {
          const i = latest.current.input;
          const r = await postJson<{ tours: TourCandidate[] }>("/api/find-tours", { destination: i.destination.trim(), categories: [...TOUR_CATEGORIES_FOR_BUILD], currency: i.currency });
          const plan = budgetPlan(i, null);
          const spent = sumItineraryCosts(latest.current.days, latest.current.pmChoice).admissionPerPerson;
          const remaining = plan ? Math.max(0, plan.caps.admissionPerPerson - spent) : null;
          const picked = pickTours(r.tours, remaining);
          setTours(picked);
          set(
            "tours",
            picked.length > 0 ? "done" : "skipped",
            picked.length > 0
              ? `${picked.length}개 추천${remaining !== null ? ` (남은 1인 입장·투어 예산 ${remaining.toLocaleString("ko-KR")} 안)` : ""}`
              : remaining !== null
                ? "남은 예산 안의 투어가 없습니다"
                : "요금이 확인된 투어가 없습니다",
          );
        } catch {
          set("tours", "error", "투어를 찾지 못했습니다");
        }
      })();
      await Promise.all([quote, tourStep]);
    } finally {
      setRunning(false);
    }
  }, [running, generate]);

  /** 다른 숙소 후보로 바꾼다 */
  const chooseHotel = (city: string, hotel: HotelCandidate) => {
    const cap = budgetPlan(latest.current.input, null)?.caps.roomPerNight ?? null;
    const pick = pickHotel([hotel], null);
    if (!pick) return;
    const picked: HotelPick = { ...pick, overBudget: cap !== null && pick.rate > cap };
    update(hotelPatch(latest.current.input, { [city]: picked }, hotelChoices.length >= 2));
    setHotelChoices((prev) => prev.map((c) => (c.city === city ? { ...c, picked } : c)));
  };

  return { steps, running, run, hotelChoices, chooseHotel, tours };
}

export type AutoBuild = ReturnType<typeof useAutoBuild>;

/** 입력 화면 버튼 옆에 보여 줄 한 줄 — 지금 하는 단계, 끝났으면 결과 요약. 시작 전이면 빈 문자열 */
export function autoBuildStatus(build: Pick<AutoBuild, "steps" | "running">): string {
  const current = build.steps.find((s) => s.status === "running");
  if (build.running) return current ? `자동 구성 중 — ${current.label}${current.message ? ` (${current.message})` : ""}` : "자동 구성 중...";
  if (build.steps.every((s) => s.status === "pending")) return "";
  const problems = build.steps.filter((s) => s.status === "error").map((s) => s.label);
  return problems.length > 0 ? `자동 구성 끝 — 확인 필요: ${problems.join(", ")}` : "자동 구성 끝 — 견적서와 예산 사용표를 확인하세요";
}
