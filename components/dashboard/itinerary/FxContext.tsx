"use client";

import { createContext, useContext } from "react";
import type { CurrencyCode } from "@/types";

/** 일정표 항목이 원화 환산 표기를 만드는 데 쓰는 견적 통화와 환율 (1 견적통화 = ? 원) */
export interface Fx {
  currency: CurrencyCode;
  rate: number;
}

export const FxContext = createContext<Fx>({ currency: "KRW", rate: 1 });

export function useFx(): Fx {
  return useContext(FxContext);
}
