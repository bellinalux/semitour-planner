"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import { groundRequest, needsFlight, needsGround, needsInsurance, needsLodging, needsTip, travelRequest } from "@/lib/autoQuoteRequests";
import { findCompetitorProducts } from "@/lib/competitorSearch";
import { reportPerf } from "@/lib/perf";
import { fillFromMemory } from "@/lib/costMemory";
import { estimateToPatch } from "@/lib/travelEstimate";
import type { GroundCostResponse } from "@/lib/schemas/groundCost";
import type { CostKey, CostSourceKind, LodgingWebEstimate, TravelEstimate, TripInput } from "@/types";

export type AutoStepStatus = "pending" | "running" | "done" | "skipped" | "error";

export interface AutoStep {
  key: "memory" | "fx" | "ground" | "travel" | "fees" | "competitors";
  label: string;
  status: AutoStepStatus;
  message: string;
  /** 걸린 시간(ms). 끝난 단계만 */
  ms?: number;
}

const STEPS: Pick<AutoStep, "key" | "label">[] = [
  { key: "memory", label: "지난 견적 값 불러오기" },
  { key: "fx", label: "오늘 환율" },
  { key: "ground", label: "차량·가이드 1일 요금 · 팁 · 보험" },
  { key: "travel", label: "숙박·항공 시세" },
  { key: "fees", label: "입장료·체류시간 웹 확인" },
  { key: "competitors", label: "대형 여행사 경쟁 상품" },
];

/** 단계 이름 (속도 기록 표에서 쓴다) */
export const AUTO_STEP_LABELS: Record<string, string> = Object.fromEntries(STEPS.map((s) => [s.key, s.label]));

const AFTER_GENERATE_KEY = "semitour-planner:auto-after-generate:v1";

const initialSteps = (): AutoStep[] => STEPS.map((s) => ({ ...s, status: "pending", message: "" }));

interface Options {
  input: TripInput;
  update: (patch: Partial<TripInput>) => void;
  /** 일정의 입장료·체류시간을 웹에서 확인한다 (일정이 없으면 건너뛴다) */
  verifyFees: () => Promise<boolean>;
  hasItinerary: boolean;
  /** 지금 일정 (새 일정이 들어온 것을 알아채는 데만 쓴다) */
  itinerary: unknown;
}

/**
 * "자동 견적": 비어 있는 값만 채운다. 이미 입력한 값은 덮어쓰지 않고, 채운 값은 모두 "추정"으로 표시한다.
 * 지난 견적 값 → 환율을 먼저 채우고(저장값이 AI 추정보다 우선), 나머지 웹 조사 네 가지
 * (차량·가이드, 숙박·항공, 입장료·체류시간, 경쟁 상품)는 서로 기다리지 않고 동시에 돌린다.
 */
export function useAutoQuote({ input, update, verifyFees, hasItinerary, itinerary }: Options) {
  const [steps, setSteps] = useState<AutoStep[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [filledCount, setFilledCount] = useState<number | null>(null);
  /** 코스를 만들면 자동 견적까지 이어서 돌릴지 (브라우저에 기억) */
  const [afterGenerate, setAfterGenerateState] = useState(false);
  useEffect(() => {
    try {
      // 브라우저 저장소 값이라 화면을 그린 뒤에 읽는다
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAfterGenerateState(localStorage.getItem(AFTER_GENERATE_KEY) === "1");
    } catch {
      // 무시
    }
  }, []);
  const setAfterGenerate = (on: boolean) => {
    setAfterGenerateState(on);
    try {
      localStorage.setItem(AFTER_GENERATE_KEY, on ? "1" : "0");
    } catch {
      // 무시
    }
  };

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setFilledCount(null);
    setSteps(initialSteps());
    let working: TripInput = { ...input };
    let filled = 0;
    // 단계마다 걸린 시간을 재서 화면에 보여 주고, 끝나면 속도 기록으로 보낸다 (실서버 속도 측정용)
    const startedAt = performance.now();
    const stepStart = new Map<AutoStep["key"], number>();
    const durations: Partial<Record<AutoStep["key"], number>> = {};
    const set = (key: AutoStep["key"], status: AutoStepStatus, message = "") => {
      if (status === "running") stepStart.set(key, performance.now());
      const begun = stepStart.get(key);
      const ms = status !== "running" && begun !== undefined ? Math.round(performance.now() - begun) : undefined;
      if (ms !== undefined) durations[key] = ms;
      setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status, message, ms } : s)));
    };
    /** 동시에 도는 단계가 서로의 "추정"·출처 표시를 지우지 않도록 원가 상태와 출처는 항목별로 합친다 */
    const apply = (patch: Partial<TripInput>, status?: Partial<TripInput["costStatus"]>, source?: CostSourceKind, note?: string) => {
      const keys = Object.keys(status ?? {}) as CostKey[];
      const at = new Date().toISOString();
      const full: Partial<TripInput> = status
        ? {
            ...patch,
            costStatus: { ...working.costStatus, ...status },
            ...(source ? { costSource: { ...working.costSource, ...Object.fromEntries(keys.map((k) => [k, { kind: source, at, ...(note ? { note } : {}) }])) } } : {}),
          }
        : patch;
      working = { ...working, ...full };
      update(full);
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

      // 3~6. 웹 조사 — 동시에 진행
      const ground = async () => {
        const needGround = needsGround(working);
        const needTip = needsTip(working);
        const needInsurance = needsInsurance(working);
        if (!destination) set("ground", "skipped", "여행지가 없습니다");
        else if (!needGround && !needTip && !needInsurance) set("ground", "skipped", "이미 입력되어 있습니다");
        else {
          set("ground", "running");
          try {
            const r = await postJson<GroundCostResponse>("/api/estimate-ground", groundRequest(working));
            const notes: string[] = [];
            if (r.searched && needGround && (r.vehicleCostPerDay > 0 || r.guideCostPerDay > 0)) {
              apply({ vehicleCostPerDay: r.vehicleCostPerDay, guideCostPerDay: r.guideCostPerDay }, { vehicle: "estimated", guide: "estimated" }, "web");
              filled += (r.vehicleCostPerDay > 0 ? 1 : 0) + (r.guideCostPerDay > 0 ? 1 : 0);
              notes.push([r.vehicleNote, r.guideNote].filter(Boolean).join(" · ") || "차량·가이드 웹 검색으로 추정");
            }
            // 가이드·기사 팁: 1인 1일 관례 금액 × 여행 일수 (현지 일정이 있는 날 기준)
            const tipDays = Math.max(1, working.groundDaysOverride || working.days);
            if (r.searched && needTip && (r.tipPerPersonPerDay ?? 0) > 0) {
              apply({ tipPerPerson: Math.round(r.tipPerPersonPerDay * tipDays) });
              filled += 1;
              notes.push(`팁 1인 1일 ${r.tipPerPersonPerDay.toLocaleString("ko-KR")} × ${tipDays}일${r.tipNote ? ` (${r.tipNote})` : ""}`);
            }
            if (r.searched && needInsurance && (r.insurancePerPerson ?? 0) > 0) {
              apply({ insurancePerPerson: r.insurancePerPerson });
              filled += 1;
              notes.push(`여행자보험 1인 ${r.insurancePerPerson.toLocaleString("ko-KR")}${r.insuranceNote ? ` (${r.insuranceNote})` : ""}`);
            }
            if (notes.length > 0) set("ground", "done", notes.join(" · "));
            else set("ground", "error", "웹 검색 근거를 찾지 못했습니다. 직접 입력해 주세요");
          } catch (err) {
            set("ground", "error", err instanceof Error ? err.message : "추정하지 못했습니다");
          }
        }

      };

      /**
       * 업체 견적서에 호텔 이름이 있으면 그 호텔들의 1박 시세를 하나씩 찾는다 (등급 평균보다 정확).
       * 요금을 찾은 호텔들의 평균을 숙박 요금으로 넣고, 호텔별 범위는 업체 견적 검증에 남긴다. 숙박을 채웠으면 true.
       */
      const lodgingByHotelNames = async (): Promise<string | null> => {
        const q = working.supplierQuote;
        const names = q?.hotelNames ?? [];
        if (!q || names.length === 0) return null;
        try {
          const r = await postJson<{ estimate: LodgingWebEstimate; searched: boolean }>("/api/search-lodging-price", {
            destination,
            lodgingType: working.lodgingType === "resort" ? "resort" : "hotel",
            hotelGrade: working.hotelGrade,
            currency: working.currency,
            hotelNames: names.slice(0, 6),
            ...(working.departureDate ? { checkIn: working.departureDate } : {}),
            ...(working.nights > 0 ? { nights: working.nights } : {}),
          });
          const hotels = r.estimate.hotels ?? [];
          const found = hotels.filter((h) => h.found);
          const latest = working.supplierQuote ?? q;
          if (found.length === 0) {
            apply({ supplierQuote: { ...latest, hotelRates: hotels } });
            return null;
          }
          const avg = Math.round(found.reduce((sum, h) => sum + (h.rateLow + h.rateHigh) / 2, 0) / found.length);
          apply(
            {
              lodgingRatePerNight: avg,
              ...(r.estimate.cityTaxPerPersonPerNight > 0 && working.cityTaxPerPersonPerNight === 0 ? { cityTaxPerPersonPerNight: r.estimate.cityTaxPerPersonPerNight } : {}),
              supplierQuote: { ...latest, hotelRates: hotels },
            },
            { lodging: "estimated" },
            "web",
            `견적서 호텔 ${found.length}곳 시세 평균${working.departureDate ? "" : " (출발일 미정)"}`,
          );
          return `숙박 — 견적서 호텔 ${found.length}/${names.length}곳 시세 평균`;
        } catch {
          return null;
        }
      };

      const travel = async () => {
        const byName = needsLodging(working) && destination ? await lodgingByHotelNames() : null;
        if (byName) filled += 1;
        const needLodging = needsLodging(working);
        const needFlight = needsFlight(working);
        if (!destination) set("travel", "skipped", "여행지가 없습니다");
        else if (!needLodging && !needFlight) {
          if (byName) set("travel", "done", byName);
          else set("travel", "skipped", working.packageType === "land" ? "랜드만 판매" : "이미 입력되어 있습니다");
        }
        else {
          set("travel", "running");
          try {
            const { estimate } = await postJson<{ estimate: TravelEstimate }>("/api/estimate-travel", travelRequest(working));
            const { patch, applied } = estimateToPatch(working, estimate);
            const { costStatus, ...values } = patch;
            const status: Partial<TripInput["costStatus"]> = {};
            // 이미 넣은(항공편을 골랐거나 직접 입력한) 금액은 AI 추정으로 덮어쓰지 않는다
            if (needFlight && costStatus) status.flight = costStatus.flight;
            else delete values.flightPricePerPerson;
            if (needLodging && costStatus) status.lodging = costStatus.lodging;
            else {
              delete values.lodgingRatePerNight;
              delete values.cityTaxPerPersonPerNight;
            }
            const names = applied.filter((n) => (n === "항공료" ? needFlight : needLodging));
            const basis = estimate.searched ? "웹 검색 시세" : "AI 추정";
            apply(values, status, estimate.searched ? "web" : "ai", "시세");
            filled += names.length;
            set("travel", "done", [byName, names.length > 0 ? `${names.join(", ")} ${basis}` : ""].filter(Boolean).join(" · ") || "채울 값이 없었습니다");
          } catch (err) {
            set("travel", "error", err instanceof Error ? err.message : "추정하지 못했습니다");
          }
        }

      };

      const fees = async () => {
        if (!hasItinerary) set("fees", "skipped", "코스를 먼저 만드세요");
        else {
          set("fees", "running");
          try {
            // 한 번 실패(시간 초과 등)하면 한 번 더 시도한다
            const ok = (await verifyFees()) || (await verifyFees());
            if (ok) set("fees", "done", "일정표에 반영했습니다");
            else set("fees", "error", "확인하지 못했습니다. 일정표의 \"다시 시도\"로 다시 확인하세요");
          } catch {
            set("fees", "error", "확인하지 못했습니다");
          }
        }

      };

      const competitors = async () => {
        if (!destination) set("competitors", "skipped", "여행지가 없습니다");
        else if (working.competitors.length > 0) set("competitors", "skipped", "이미 등록되어 있습니다");
        else {
          set("competitors", "running");
          try {
            const found = await findCompetitorProducts(working);
            if (found.length > 0) {
              apply({ competitors: found });
              set("competitors", "done", `${found.map((c) => c.source?.agency || c.name).join(", ")} 추가`);
            } else set("competitors", "error", "가격이 확인된 상품을 찾지 못했습니다");
          } catch (err) {
            set("competitors", "error", err instanceof Error ? err.message : "찾지 못했습니다");
          }
        }
      };

      await Promise.all([ground(), travel(), fees(), competitors()]);
    } finally {
      setFilledCount(filled);
      setRunning(false);
      reportPerf("auto-quote", Math.round(performance.now() - startedAt), durations, destination);
    }
  }, [running, input, update, verifyFees, hasItinerary]);

  // "코스를 만들면 자동 견적도 이어서" — 코스 생성이 끝나면 armAfterGenerate()로 걸어 두고,
  // 새 일정이 화면에 들어온 다음(입장료 확인이 새 일정을 보도록) 한 번 실행한다
  const armedRef = useRef(false);
  const armAfterGenerate = useCallback(() => {
    armedRef.current = true;
  }, []);
  useEffect(() => {
    if (!armedRef.current || !hasItinerary) return;
    armedRef.current = false;
    void run();
  }, [itinerary, hasItinerary, run]);

  return { steps, running, filledCount, run, afterGenerate, setAfterGenerate, armAfterGenerate };
}

export type AutoQuote = ReturnType<typeof useAutoQuote>;
