"use client";

import { useState } from "react";
import { findCompetitorProducts, flightPriceForCompare } from "@/lib/competitorSearch";
import type { FlightOption, TripInput } from "@/types";

export interface CompetitorAutoFindView {
  running: boolean;
  message: string | null;
  /** 경쟁 상품을 찾아 비어 있는 경쟁사 목록에 넣는다 (이미 있으면 그대로) */
  run: (input: TripInput, flight?: FlightOption | null) => void;
}

/**
 * 타업체 상품 자동 찾기 — 코스를 만들면(자동 견적을 돌리지 않을 때도) 같은 여행지·기간의 대형 여행사 상품을 찾아
 * 투어 비교표(같은 조건 판매가·코스·우리가 나은 점/경쟁 상품이 나은 점)를 바로 채운다.
 */
export function useCompetitorAutoFind(update: (patch: Partial<TripInput>) => void): CompetitorAutoFindView {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = (input: TripInput, flightOption: FlightOption | null = null) => {
    if (running || !input.destination.trim() || input.competitors.length > 0) return;
    setRunning(true);
    setMessage(null);
    void findCompetitorProducts(input)
      .then(async (found) => {
        if (found.length === 0) {
          setMessage("가격이 확인된 타업체 상품을 찾지 못했습니다. 입력의 '경쟁 상품'에서 직접 넣을 수 있습니다.");
          return;
        }
        // 경쟁 상품이 항공 포함이면 항공료 시세를 찾아 같은 조건(항공 뺀 가격)으로 견준다
        const flight = await flightPriceForCompare(input, found, flightOption);
        update({
          competitors: found,
          ...(flight ? { flightPricePerPerson: flight, costStatus: { ...input.costStatus, flight: "estimated" as const } } : {}),
        });
        setMessage(`타업체 상품 ${found.length}개를 찾아 투어 비교표에 넣었습니다 (${found.map((c) => c.source?.agency || c.name).join(", ")}).`);
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "타업체 상품을 찾지 못했습니다."))
      .finally(() => setRunning(false));
  };

  return { running, message, run };
}
