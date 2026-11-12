"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import { hotelCities, hotelPatch, lodgingDecided, pickHotel, pickTours, vehicleClassFor, type HotelPick } from "@/lib/autoBuild";
import { budgetPlan } from "@/lib/budget";
import { sumItineraryCosts } from "@/lib/cost";
import { overnightNights, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, FlightOption, HotelCandidate, TourCandidate, TripInput } from "@/types";
import { pickFlightForCourse } from "@/lib/flightPlan";
import { tripSpanFromFlight } from "@/lib/flightApply";

export type BuildStepKey = "flight" | "course" | "hotel" | "quote" | "tours";
export type BuildStepStatus = "pending" | "running" | "done" | "skipped" | "error";

export interface BuildStep {
  key: BuildStepKey;
  label: string;
  status: BuildStepStatus;
  message: string;
}

const STEPS: Pick<BuildStep, "key" | "label">[] = [
  { key: "flight", label: "항공편 고르기 (도착·출국 시각)" },
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
  /** 코스가 없으면 만든다. 만든 일정(실패하면 null). override: 방금 고른 항공편처럼 아직 화면 상태에 안 들어간 입력 */
  generate: (override?: Partial<TripInput>) => Promise<DayPlan[] | null>;
  /** 자동 견적(빈 값 채우기) */
  runAutoQuote: () => Promise<void>;
  /** 고른 항공편 반영 (항공료·출발일·기간·항공 이동일) */
  applyFlight?: (flight: FlightOption) => void;
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
export function useAutoBuild({ input, update, days, pmChoice, generate, runAutoQuote, applyFlight }: Options) {
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
      // 0. 항공편 — 코스를 만들기 전에 골라야 도착일·출국일을 실제 시각에 맞춰 짠다
      let override: Partial<TripInput> | undefined;
      {
        const i = latest.current.input;
        const hasTimes = !!i.selectedFlight && !!i.selectedFlight.arriveTime && !!i.selectedFlight.returnDepartTime;
        if (!i.includesFlights || i.tripScope !== "overseas" || i.mode !== "ai") set("flight", "skipped", "항공 미포함 상품");
        else if (hasTimes) set("flight", "skipped", `고른 항공편 사용 (현지 ${i.selectedFlight!.arriveTime} 도착 · ${i.selectedFlight!.returnDepartTime} 출발)`);
        else if (latest.current.days.length > 0) set("flight", "skipped", "만들어 둔 코스가 있어 항공편은 항공 패널에서 고르세요");
        else if (!applyFlight || !i.originCity.trim() || !i.destination.trim()) set("flight", "skipped", "출발지·여행지가 없어 예상 시각으로 만듭니다");
        else {
          set("flight", "running");
          try {
            const r = await postJson<{ flights: FlightOption[] }>("/api/search-flight-options", {
              origin: i.originCity.trim(),
              destination: i.destination.trim(),
              days: i.days,
              nights: i.nights,
              departureDate: i.departureDate,
              currency: i.currency,
            });
            const pick = pickFlightForCourse(r.flights ?? [], i, tripSpanFromFlight);
            if (!pick) set("flight", "error", `${i.nights}박 ${i.days}일에 맞는 항공편을 찾지 못해 예상 시각으로 만듭니다`);
            else {
              applyFlight(pick);
              // 코스 만들기는 이 실행이 시작될 때의 입력을 보므로, 고른 항공편과 그 기간을 직접 넘긴다
              const span = tripSpanFromFlight(pick);
              override = { selectedFlight: pick, includesFlights: true, ...(span ? { departureDate: span.departureDate, days: span.days, nights: span.nights } : {}) };
              set("flight", "done", `${[pick.airline, pick.flightNumber].filter(Boolean).join(" ")} — 현지 ${pick.arriveTime} 도착 · ${pick.returnDepartTime} 출발`);
            }
          } catch {
            set("flight", "error", "항공편을 찾지 못해 예상 시각으로 만듭니다");
          }
        }
      }

      // 1. 코스
      if (latest.current.days.length > 0) set("course", "skipped", `만들어 둔 ${latest.current.days.length}일 코스를 씁니다`);
      else {
        set("course", "running");
        const made = await generate(override);
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
              ? `${picked.length}개 추천${remaining !== null ? ` (남은 1인 입장·투어 예산 ${Math.round(remaining).toLocaleString("ko-KR")} 안)` : ""}`
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
  }, [running, generate, applyFlight]);

  /** 다른 숙소 후보로 바꾼다 */
  const chooseHotel = (city: string, hotel: HotelCandidate) => {
    const cap = budgetPlan(latest.current.input, null)?.caps.roomPerNight ?? null;
    const pick = pickHotel([hotel], null);
    if (!pick) return;
    const picked: HotelPick = { ...pick, overBudget: cap !== null && pick.rate > cap };
    update(hotelPatch(latest.current.input, { [city]: picked }, hotelChoices.length >= 2));
    setHotelChoices((prev) => prev.map((c) => (c.city === city ? { ...c, picked } : c)));
  };

  /** 숙소 후보 표시만 이전 선택으로 되돌린다 (예산 맞추기 되돌리기 — 견적 값은 부르는 쪽이 되돌린다) */
  const restoreHotelPicks = (picks: Record<string, { hotel: HotelCandidate; rate: number; overBudget?: boolean } | null>) =>
    setHotelChoices((prev) =>
      prev.map((c) => {
        if (!(c.city in picks)) return c;
        const p = picks[c.city];
        return { ...c, picked: p ? { ...p, overBudget: p.overBudget ?? false } : null };
      }),
    );

  return { steps, running, run, hotelChoices, chooseHotel, restoreHotelPicks, tours };
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
