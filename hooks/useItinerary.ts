"use client";

import { useCallback, useRef, useState } from "react";
import type { AsyncState, CurrencyCode, DayPlan, ItineraryItem, PmFreeOption, TripInput } from "@/types";

type PmChoice = Record<number, PmFreeOption["id"]>;

async function requestItinerary(input: TripInput, signal: AbortSignal): Promise<DayPlan[]> {
  const res = await fetch("/api/generate-itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      destination: input.destination,
      days: input.days,
      travelers: input.travelers,
      currency: input.currency,
      themes: input.themes,
      notes: input.notes,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `요청에 실패했습니다. (${res.status})`);
  }
  return data.days as DayPlan[];
}

/** 일정 생성 요청 상태, 결과, 날짜별 오후 옵션(A/B) 선택을 관리한다. */
export function useItinerary() {
  const [state, setState] = useState<AsyncState>({ status: "idle" });
  const [days, setDays] = useState<DayPlan[]>([]);
  const [pmChoice, setPmChoice] = useState<PmChoice>({});
  /** 일정 금액이 어느 통화로 생성됐는지 (이후 통화를 바꾸면 견적에서 경고) */
  const [generatedCurrency, setGeneratedCurrency] = useState<CurrencyCode | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (input: TripInput) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({ status: "loading" });
    try {
      const result = await requestItinerary(input, controller.signal);
      setDays(result);
      setGeneratedCurrency(input.currency);
      setPmChoice(Object.fromEntries(result.map((d) => [d.day, d.pmFreeOptions[0]?.id ?? "A"])));
      setState({ status: "success" });
    } catch (err) {
      if (controller.signal.aborted) return; // 새 요청으로 대체된 경우
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
      });
    }
  }, []);

  const selectPmOption = useCallback(
    (day: number, option: PmFreeOption["id"]) => setPmChoice((prev) => ({ ...prev, [day]: option })),
    [],
  );

  /** 사용자가 AI 추정 금액을 직접 고친다. 수정한 항목은 추정치 표시를 해제한다. */
  const updateItemCost = useCallback(
    (itemId: string, patch: Partial<Pick<ItineraryItem, "entryFee" | "mealCost">>) => {
      const touch = (item: ItineraryItem) =>
        item.id === itemId ? { ...item, ...patch, isEstimated: false } : item;
      setDays((prev) =>
        prev.map((day) => ({
          ...day,
          amGuided: day.amGuided.map(touch),
          pmFreeOptions: day.pmFreeOptions.map((o) => ({ ...o, items: o.items.map(touch) })),
        })),
      );
    },
    [],
  );

  return { state, days, pmChoice, generatedCurrency, generate, selectPmOption, updateItemCost };
}
