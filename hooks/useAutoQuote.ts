"use client";

import { useCallback, useState } from "react";
import { postJson } from "@/lib/api";
import { candidateToCompetitor } from "@/lib/competitors";
import { fillFromMemory } from "@/lib/costMemory";
import { estimateToPatch } from "@/lib/travelEstimate";
import type { GroundCostResponse } from "@/lib/schemas/groundCost";
import type { CompetitorCandidate, TravelEstimate, TripInput } from "@/types";

export type AutoStepStatus = "pending" | "running" | "done" | "skipped" | "error";

export interface AutoStep {
  key: "memory" | "fx" | "ground" | "travel" | "fees" | "competitors";
  label: string;
  status: AutoStepStatus;
  message: string;
}

const STEPS: Pick<AutoStep, "key" | "label">[] = [
  { key: "memory", label: "지난 견적 값 불러오기" },
  { key: "fx", label: "오늘 환율" },
  { key: "ground", label: "차량·가이드 1일 요금" },
  { key: "travel", label: "숙박·항공 시세" },
  { key: "fees", label: "입장료·체류시간 웹 확인" },
  { key: "competitors", label: "대형 여행사 경쟁 상품" },
];

const initialSteps = (): AutoStep[] => STEPS.map((s) => ({ ...s, status: "pending", message: "" }));

interface Options {
  input: TripInput;
  update: (patch: Partial<TripInput>) => void;
  /** 일정의 입장료·체류시간을 웹에서 확인한다 (일정이 없으면 건너뛴다) */
  verifyFees: () => Promise<void>;
  hasItinerary: boolean;
}

/**
 * "자동 견적": 비어 있는 값만 순서대로 채운다. 이미 입력한 값은 덮어쓰지 않고, 채운 값은 모두 "추정"으로 표시한다.
 * 순서: 지난 견적 값 → 환율 → 차량·가이드 → 숙박·항공 → 입장료·체류시간 → 경쟁 상품.
 * 앞 단계에서 채운 값이 있으면 뒤 단계(AI 추정)는 건너뛴다(저장값이 AI 추정보다 우선).
 */
export function useAutoQuote({ input, update, verifyFees, hasItinerary }: Options) {
  const [steps, setSteps] = useState<AutoStep[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [filledCount, setFilledCount] = useState<number | null>(null);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setFilledCount(null);
    setSteps(initialSteps());
    let working: TripInput = { ...input };
    let filled = 0;
    const set = (key: AutoStep["key"], status: AutoStepStatus, message = "") =>
      setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status, message } : s)));
    const apply = (patch: Partial<TripInput>) => {
      working = { ...working, ...patch };
      update(patch);
    };
    const destination = working.destination.trim();

    try {
      // 1. 지난 견적 값
      set("memory", "running");
      const memory = destination ? fillFromMemory(working) : null;
      if (memory) {
        apply(memory.patch);
        filled += memory.applied.length;
        set("memory", "done", `${memory.applied.join(", ")} (지난 견적 ${memory.savedAt.slice(0, 10)} 기준)`);
      } else set("memory", "skipped", destination ? "이 여행지로 저장된 값이 없거나 이미 다 채워져 있습니다" : "여행지가 없습니다");

      // 2. 환율
      if (working.currency === "KRW") set("fx", "skipped", "원화 견적");
      else {
        set("fx", "running");
        try {
          const res = await fetch(`/api/fx?code=${working.currency}`);
          const data = (await res.json().catch(() => null)) as { krwPerUnit?: number } | null;
          if (res.ok && data?.krwPerUnit) {
            const rate = Math.round(data.krwPerUnit * 100) / 100;
            apply({ exchangeRateToKrw: rate });
            set("fx", "done", `1 ${working.currency} = ₩${rate.toLocaleString("ko-KR")}`);
          } else set("fx", "error", "환율을 가져오지 못했습니다");
        } catch {
          set("fx", "error", "환율 서버에 연결하지 못했습니다");
        }
      }

      // 3. 차량·가이드
      if (!destination) set("ground", "skipped", "여행지가 없습니다");
      else if (working.vehicleCostPerDay + working.guideCostPerDay > 0) set("ground", "skipped", "이미 입력되어 있습니다");
      else {
        set("ground", "running");
        try {
          const r = await postJson<GroundCostResponse>("/api/estimate-ground", {
            destination,
            travelers: Math.min(60, Math.max(1, working.travelers)),
            currency: working.currency,
            tripScope: working.tripScope,
          });
          if (r.searched && (r.vehicleCostPerDay > 0 || r.guideCostPerDay > 0)) {
            apply({
              vehicleCostPerDay: r.vehicleCostPerDay,
              guideCostPerDay: r.guideCostPerDay,
              costStatus: { ...working.costStatus, vehicle: "estimated", guide: "estimated" },
            });
            filled += (r.vehicleCostPerDay > 0 ? 1 : 0) + (r.guideCostPerDay > 0 ? 1 : 0);
            set("ground", "done", [r.vehicleNote, r.guideNote].filter(Boolean).join(" · ") || "웹 검색으로 추정");
          } else set("ground", "error", "웹 검색 근거를 찾지 못했습니다. 직접 입력해 주세요");
        } catch (err) {
          set("ground", "error", err instanceof Error ? err.message : "추정하지 못했습니다");
        }
      }

      // 4. 숙박·항공 시세
      const needLodging = working.packageType !== "land" && working.lodgingRatePerNight === 0 && !Object.values(working.lodgingCityRates).some((v) => v > 0);
      const needFlight = working.packageType === "full" && working.flightPricePerPerson === 0;
      if (!destination) set("travel", "skipped", "여행지가 없습니다");
      else if (!needLodging && !needFlight) set("travel", "skipped", working.packageType === "land" ? "랜드만 판매" : "이미 입력되어 있습니다");
      else {
        set("travel", "running");
        try {
          const { estimate } = await postJson<{ estimate: TravelEstimate }>("/api/estimate-travel", {
            origin: working.originCity.trim() || "인천",
            destination,
            currency: working.currency,
            nights: working.nights,
            hotelGrade: working.hotelGrade,
          });
          const { patch, applied } = estimateToPatch(working, estimate);
          // 이미 넣은(항공편을 골랐거나 직접 입력한) 금액은 AI 추정으로 덮어쓰지 않는다
          if (!needFlight) {
            delete patch.flightPricePerPerson;
            if (patch.costStatus) patch.costStatus = { ...patch.costStatus, flight: working.costStatus.flight };
          }
          if (!needLodging) {
            delete patch.lodgingRatePerNight;
            delete patch.cityTaxPerPersonPerNight;
            if (patch.costStatus) patch.costStatus = { ...patch.costStatus, lodging: working.costStatus.lodging };
          }
          const names = applied.filter((n) => (n === "항공료" ? needFlight : needLodging));
          apply(patch);
          filled += names.length;
          set("travel", "done", names.length > 0 ? `${names.join(", ")} AI 추정` : "채울 값이 없었습니다");
        } catch (err) {
          set("travel", "error", err instanceof Error ? err.message : "추정하지 못했습니다");
        }
      }

      // 5. 입장료·체류시간
      if (!hasItinerary) set("fees", "skipped", "코스를 먼저 만드세요");
      else {
        set("fees", "running");
        try {
          await verifyFees();
          set("fees", "done", "일정표에 반영했습니다");
        } catch {
          set("fees", "error", "확인하지 못했습니다");
        }
      }

      // 6. 경쟁 상품
      if (!destination) set("competitors", "skipped", "여행지가 없습니다");
      else if (working.competitors.length > 0) set("competitors", "skipped", "이미 등록되어 있습니다");
      else {
        set("competitors", "running");
        try {
          const r = await postJson<{ products: CompetitorCandidate[]; searchedAt: string }>("/api/find-competitors", {
            destination,
            nights: working.nights,
            days: working.days,
            currency: working.currency,
            packageType: working.packageType,
            originCity: working.originCity.trim(),
          });
          const picked = r.products.filter((p) => p.pricePerPerson > 0).slice(0, 3);
          if (picked.length > 0) {
            apply({ competitors: picked.map((p) => candidateToCompetitor(p, r.searchedAt)) });
            set("competitors", "done", `${picked.map((p) => p.agency || p.productName).join(", ")} 추가`);
          } else set("competitors", "error", "가격이 확인된 상품을 찾지 못했습니다");
        } catch (err) {
          set("competitors", "error", err instanceof Error ? err.message : "찾지 못했습니다");
        }
      }
    } finally {
      setFilledCount(filled);
      setRunning(false);
    }
  }, [running, input, update, verifyFees, hasItinerary]);

  return { steps, running, filledCount, run };
}

export type AutoQuote = ReturnType<typeof useAutoQuote>;
