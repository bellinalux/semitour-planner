"use client";

import { useCallback, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import { defaultPmChoice, mapDayItems, tourDayCount, withTravelDays, type PmChoice } from "@/lib/itinerary";
import { insertItem } from "@/lib/tourItem";
import type {
  AsyncState,
  CourseMeta,
  CurrencyCode,
  DayPlan,
  ItineraryItem,
  PmFreeOption,
  TourSlot,
  TripInput,
} from "@/types";

/** 코스 붙여넣기에서 읽어낸 기간/도시 (입력 폼에 반영하는 데 쓴다) */
export interface DetectedTrip {
  days: number;
  nights: number;
  cities: string[];
}

export interface GeneratedItinerary {
  days: DayPlan[];
  pmChoice: PmChoice;
  meta: CourseMeta | null;
  detected: DetectedTrip | null;
}

/** 입력 모드에 따라 AI가 세미투어를 만들거나, 붙여넣은 업체 코스를 구조화한다. */
async function requestItinerary(input: TripInput, signal: AbortSignal): Promise<Omit<GeneratedItinerary, "pmChoice">> {
  if (input.mode === "paste") {
    const result = await postJson<{ days: DayPlan[]; meta: CourseMeta; nights: number; totalDays: number }>(
      "/api/parse-course",
      { text: input.courseText, currency: input.currency },
      signal,
    );
    return {
      days: result.days,
      meta: result.meta,
      detected: { days: result.totalDays, nights: result.nights, cities: result.meta.cities },
    };
  }

  const { days } = await postJson<{ days: DayPlan[] }>(
    "/api/generate-itinerary",
    {
      destination: input.destination,
      days: tourDayCount(input),
      travelers: input.travelers,
      currency: input.currency,
      themes: input.themes,
      notes: input.notes,
    },
    signal,
  );
  return { days: input.includesFlights ? withTravelDays(days, input) : days, meta: null, detected: null };
}

/** 일정 생성 요청 상태, 결과, 날짜별 오후 옵션(A/B) 선택, 항목 편집을 관리한다. */
export function useItinerary() {
  const [state, setState] = useState<AsyncState>({ status: "idle" });
  const [days, setDays] = useState<DayPlan[]>([]);
  const [pmChoice, setPmChoice] = useState<PmChoice>({});
  const [meta, setMeta] = useState<CourseMeta | null>(null);
  /** 일정 금액이 어느 통화로 생성됐는지 (이후 통화를 바꾸면 견적에서 경고) */
  const [generatedCurrency, setGeneratedCurrency] = useState<CurrencyCode | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  /** 성공하면 생성된 일정을 반환한다. 실패하거나 새 요청으로 대체되면 null. */
  const generate = useCallback(async (input: TripInput): Promise<GeneratedItinerary | null> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({ status: "loading" });
    try {
      const result = await requestItinerary(input, controller.signal);
      const choice = defaultPmChoice(result.days);
      setDays(result.days);
      setPmChoice(choice);
      setMeta(result.meta);
      setGeneratedCurrency(input.currency);
      setState({ status: "success" });
      return { ...result, pmChoice: choice };
    } catch (err) {
      if (controller.signal.aborted) return null; // 새 요청으로 대체된 경우
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
      });
      return null;
    }
  }, []);

  const selectPmOption = useCallback(
    (day: number, option: PmFreeOption["id"]) => setPmChoice((prev) => ({ ...prev, [day]: option })),
    [],
  );

  /** 항목을 고친다. 금액을 직접 고친 항목은 추정치 표시를 해제한다. */
  const updateItem = useCallback((itemId: string, patch: Partial<ItineraryItem>) => {
    const touchesCost = "entryFee" in patch || "mealCost" in patch;
    setDays((prev) =>
      prev.map((day) =>
        mapDayItems(day, (item) =>
          item.id === itemId ? { ...item, ...patch, ...(touchesCost ? { isEstimated: false } : {}) } : item,
        ),
      ),
    );
  }, []);

  const deleteItem = useCallback((itemId: string) => {
    setDays((prev) => prev.map((day) => mapDayItems(day, (item) => (item.id === itemId ? null : item))));
  }, []);

  /** 업체 코스(linear) 날짜의 끝에 빈 항목을 추가한다. */
  const addItem = useCallback((dayNo: number) => {
    const item: ItineraryItem = {
      id: `new-${crypto.randomUUID().slice(0, 8)}`,
      type: "sightseeing",
      admission: "unknown",
      name: "새 항목",
      description: "",
      stayMinutes: 0,
      travelMinutesToNext: null,
      entryFee: 0,
      mealCost: 0,
      isEstimated: false,
    };
    setDays((prev) => prev.map((day) => (day.day === dayNo && day.kind === "linear" ? { ...day, items: [...day.items, item] } : day)));
  }, []);

  /** 투어 카탈로그에서 고른 투어를 지정한 날짜와 위치에 넣는다. */
  const addTour = useCallback((dayNo: number, slot: TourSlot, item: ItineraryItem) => {
    setDays((prev) => prev.map((day) => (day.day === dayNo ? insertItem(day, slot, item) : day)));
  }, []);

  /** 저장된 일정을 그대로 되살린다 (진행 중인 생성 요청은 취소) */
  const restore = useCallback((saved: Pick<GeneratedItinerary, "days" | "pmChoice" | "meta"> & { generatedCurrency: CurrencyCode | null }) => {
    controllerRef.current?.abort();
    setDays(saved.days);
    setPmChoice(saved.pmChoice);
    setMeta(saved.meta);
    setGeneratedCurrency(saved.generatedCurrency);
    setState(saved.days.length > 0 ? { status: "success" } : { status: "idle" });
  }, []);

  return {
    state,
    days,
    pmChoice,
    meta,
    generatedCurrency,
    generate,
    selectPmOption,
    updateItem,
    deleteItem,
    addItem,
    addTour,
    restore,
  };
}
