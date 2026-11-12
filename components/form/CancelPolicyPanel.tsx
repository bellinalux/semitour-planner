"use client";

import { CalendarX2 } from "lucide-react";
import { useKoreanHolidays } from "@/hooks/useKoreanHolidays";
import { effectivePolicy, normalizeCancelPolicy } from "@/lib/cancelPolicy";
import type { CompanyProfile, TripInput } from "@/types";
import { CancelPolicyEditor } from "./CancelPolicyEditor";

/** 이 상품의 취소 및 환불 규정 — 회사 기본을 쓰거나 이 상품만 다르게 (출발일로 실제 날짜·마감을 보여 준다) */
export function CancelPolicyPanel({ input, onChange, company }: { input: TripInput; onChange: (patch: Partial<TripInput>) => void; company: CompanyProfile }) {
  const holidays = useKoreanHolidays(input.departureDate);
  const own = input.cancelPolicy !== null;
  const policy = effectivePolicy(company, input);
  const perPerson = input.pricingMode === "fixed_price" ? input.fixedPricePerPerson : 0;

  return (
    <section aria-label="취소 및 환불 규정" className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <CalendarX2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          취소 및 환불 규정 ({policy.mode === "custom" ? "특별약관" : "표준약관"})
        </span>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <input type="checkbox" checked={own} onChange={(e) => onChange({ cancelPolicy: e.target.checked ? normalizeCancelPolicy(company.cancelPolicy) : null })} />
          이 상품만 다르게
        </label>
      </div>
      <p className="text-[11px] leading-4 text-slate-500">
        {own ? "이 상품의 규정입니다." : "회사 기본 규정입니다 (더보기 → 회사 설정에서 바꿈)."} 일정표·견적서·계약서·웹 일정표에 실제 날짜와 함께 들어가고, 특별약관이면 계약서에 별도 동의를 받습니다.
        {!input.departureDate && " 출발일을 넣으면 구간마다 날짜와 무료 취소 마감일이 보입니다."}
      </p>
      {own ? (
        <CancelPolicyEditor value={policy} onChange={(cancelPolicy) => onChange({ cancelPolicy })} departureDate={input.departureDate} perPerson={perPerson} holidays={holidays} />
      ) : (
        <CancelPolicyEditor value={policy} onChange={() => undefined} departureDate={input.departureDate} perPerson={perPerson} holidays={holidays} readOnly />
      )}
    </section>
  );
}
