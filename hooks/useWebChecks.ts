"use client";

import { useState } from "react";
import type { AccessibilityCheckView, FeeCheckView, OptionSuggestView } from "@/components/dashboard/ItineraryPanel";
import { useRequest } from "@/hooks/useRequest";
import { accessibilityCheckTargets, applyAccessibilityResults, type AccessibilityApplySummary } from "@/lib/accessibilityCheck";
import { applyFeeResults, feeCheckTargets, type FeeApplySummary } from "@/lib/fees";
import { applyOptionSuggestions, optionSuggestTargets, type OptionSuggestApplySummary } from "@/lib/optionSuggestions";
import type { VerifyAccessibilityResponse } from "@/lib/schemas/accessibility";
import type { VerifyFeesResponse } from "@/lib/schemas/market";
import type { SuggestOptionsResponse } from "@/lib/schemas/optionSuggest";
import type { CourseMeta, DayPlan, TripInput } from "@/types";

const FEE_LIMIT = 40;
const OPTION_LIMIT = 30;
const ACCESSIBILITY_LIMIT = 30;

interface Args {
  input: TripInput;
  days: DayPlan[];
  meta: CourseMeta | null;
  replaceDays: (days: DayPlan[]) => void;
}

/**
 * 일정 항목을 웹에서 확인해 반영하는 세 가지 작업 — 입장료·체류 시간, 팔 만한 선택 옵션, 이용 편의시설.
 * 일정 패널에 넘길 진행 상태·결과 요약(view)과, 자동 견적에서 쓰는 요금 확인(verifyFees)을 돌려준다.
 */
export function useWebChecks({ input, days, meta, replaceDays }: Args) {
  const feeRequest = useRequest<
    { destination: string; currency: string; exchangeRateToKrw: number; items: { id: string; name: string; city?: string }[] },
    VerifyFeesResponse
  >("/api/verify-fees");
  const [feeSummary, setFeeSummary] = useState<FeeApplySummary | null>(null);
  const optionRequest = useRequest<
    { destination: string; currency: string; exchangeRateToKrw: number; items: { id: string; name: string; description?: string; city?: string }[] },
    SuggestOptionsResponse
  >("/api/suggest-options");
  const [optionSummary, setOptionSummary] = useState<OptionSuggestApplySummary | null>(null);
  const accessibilityRequest = useRequest<{ destination: string; items: { id: string; name: string; city?: string }[] }, VerifyAccessibilityResponse>(
    "/api/verify-accessibility",
  );
  const [accessibilitySummary, setAccessibilitySummary] = useState<AccessibilityApplySummary | null>(null);

  const destination = input.destination.trim() || meta?.cities.join(", ") || "";

  /** 입장료·체험료를 웹에서 확인해 일정 항목에 반영한다. 확인해 반영했으면 true (확인할 항목이 없어도 true) */
  const verifyFees = async (): Promise<boolean> => {
    const items = feeCheckTargets(days).slice(0, FEE_LIMIT);
    if (items.length === 0) return true;
    const response = await feeRequest.run({ destination, currency: input.currency, exchangeRateToKrw: input.exchangeRateToKrw, items });
    if (!response) return false;
    const { days: next, summary } = applyFeeResults(days, response.results, response.checkedAt);
    replaceDays(next);
    setFeeSummary(summary);
    return true;
  };

  /** 코스마다 팔 만한 선택 옵션(바나나보트, 제트스키 등)을 웹에서 찾아 일정 항목에 반영한다 */
  const suggestOptions = async () => {
    const items = optionSuggestTargets(days).slice(0, OPTION_LIMIT);
    if (items.length === 0) return;
    const response = await optionRequest.run({ destination, currency: input.currency, exchangeRateToKrw: input.exchangeRateToKrw, items });
    if (!response) return;
    const { days: next, summary } = applyOptionSuggestions(days, response.results, input.currency);
    replaceDays(next);
    setOptionSummary(summary);
  };

  /** "확인 못함"으로 남은 이용 편의시설을 웹에서 다시 검색해 반영한다 */
  const verifyAccessibility = async () => {
    const items = accessibilityCheckTargets(days).slice(0, ACCESSIBILITY_LIMIT);
    if (items.length === 0) return;
    const response = await accessibilityRequest.run({ destination, items });
    if (!response) return;
    const { days: next, summary } = applyAccessibilityResults(days, response.results);
    replaceDays(next);
    setAccessibilitySummary(summary);
  };

  /** 일정을 새로 만들면 이전 확인 결과 요약을 지운다 */
  const clear = () => {
    setFeeSummary(null);
    setOptionSummary(null);
    setAccessibilitySummary(null);
  };

  const feeCheck: FeeCheckView = {
    state: feeRequest.state,
    targetCount: Math.min(FEE_LIMIT, feeCheckTargets(days).length),
    summary: feeSummary,
    sources: feeRequest.data?.sources ?? [],
    searched: feeRequest.data?.searched ?? true,
    fxUpdatedAt: feeRequest.data?.fx[0]?.updatedAt ?? "",
    onRun: () => void verifyFees(),
  };
  const optionSuggest: OptionSuggestView = {
    state: optionRequest.state,
    targetCount: Math.min(OPTION_LIMIT, optionSuggestTargets(days).length),
    summary: optionSummary,
    sources: optionRequest.data?.sources ?? [],
    searched: optionRequest.data?.searched ?? true,
    onRun: () => void suggestOptions(),
  };
  const accessibilityCheck: AccessibilityCheckView = {
    state: accessibilityRequest.state,
    targetCount: Math.min(ACCESSIBILITY_LIMIT, accessibilityCheckTargets(days).length),
    summary: accessibilitySummary,
    sources: accessibilityRequest.data?.sources ?? [],
    searched: accessibilityRequest.data?.searched ?? true,
    onRun: () => void verifyAccessibility(),
  };

  return { feeCheck, optionSuggest, accessibilityCheck, verifyFees, clear };
}
