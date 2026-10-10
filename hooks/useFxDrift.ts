"use client";

import { useEffect, useState } from "react";
import { FX_CODES } from "@/lib/fxCodes";
import { fxDrift, type FxDrift } from "@/lib/fxDrift";
import type { TripInput } from "@/types";

const TTL = 60 * 60 * 1000;

/** 1 code = 몇 원 (이 탭에서 1시간 동안 다시 쓴다) */
async function krwPer(code: string): Promise<number | null> {
  if (code === "KRW") return 1;
  const key = `semitour-fx:${code}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) ?? "null") as { rate: number; at: number } | null;
    if (hit && Date.now() - hit.at < TTL) return hit.rate;
  } catch {
    /* 다시 받기 */
  }
  try {
    const r = await fetch(`/api/fx?code=${code}`);
    if (!r.ok) return null;
    const rate = ((await r.json()) as { krwPerUnit?: number }).krwPerUnit ?? 0;
    if (!(rate > 0)) return null;
    try {
      sessionStorage.setItem(key, JSON.stringify({ rate, at: Date.now() }));
    } catch {
      /* 저장 못 해도 계속 */
    }
    return rate;
  } catch {
    return null;
  }
}

/** 외화 업체 견적의 지금 환율(원문 통화 1 = 앱 통화 몇)과 받을 때 환율의 차이 */
export function useFxDrift(input: TripInput): { drift: FxDrift | null; current: number | null } {
  const q = input.supplierQuote;
  const from = q?.originalCurrency?.toUpperCase() ?? "";
  const to = input.currency;
  const watch = input.pricingMode === "supplier" && !!q?.rate && from !== "" && from !== to && FX_CODES.has(from) && FX_CODES.has(to);
  const [rates, setRates] = useState<{ key: string; value: number | null } | null>(null);
  const key = `${from}>${to}`;

  useEffect(() => {
    if (!watch) return;
    let cancelled = false;
    void Promise.all([krwPer(from), krwPer(to)]).then(([a, b]) => {
      if (!cancelled) setRates({ key, value: a && b ? a / b : null });
    });
    return () => {
      cancelled = true;
    };
  }, [watch, from, to, key]);

  const current = watch && rates?.key === key ? rates.value : null;
  return { drift: fxDrift(input, current), current };
}
