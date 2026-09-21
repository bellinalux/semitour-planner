"use client";

import { CalendarSearch, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useRequest } from "@/hooks/useRequest";
import { formatMoney } from "@/lib/currency";
import type { FlightDeal, FlightSearchResult } from "@/types";
import type { SectionProps } from "./types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-11-03" → "11/03(화)" */
function shortDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}(${WEEKDAYS[d.getUTCDay()]})`;
}

function stops(deal: FlightDeal): string {
  return deal.transfers === 0 ? "직항" : `경유 ${deal.transfers}회`;
}

/** 캐시 요금의 예상 만료 시각이 지났으면 true */
function isStale(deal: FlightDeal): boolean {
  const t = Date.parse(deal.expiresAt);
  return Number.isFinite(t) && t < Date.now();
}

/**
 * 실제 항공 시세(Travelpayouts 캐시 최저가)로 가장 싼 출발일을 찾아, 고른 요금을 왕복 항공료에 넣는다.
 * 키가 등록되지 않았으면 서버가 안내 문구를 돌려준다 (그때는 AI 추정을 쓰면 된다).
 */
export function FlightPricePanel({ input, onChange }: SectionProps) {
  const { state, data, run } = useRequest<
    { origin: string; destination: string; days: number; currency: string; months: number },
    { result: FlightSearchResult }
  >("/api/flight-prices");
  const [originCode, setOriginCode] = useState("");
  const [destCode, setDestCode] = useState("");
  const [months, setMonths] = useState(4);
  const [appliedDate, setAppliedDate] = useState<string | null>(null);

  const canRun = input.destination.trim() !== "" && (originCode.trim() !== "" || input.originCity.trim() !== "") && input.days >= 2;
  const result = data?.result;
  const money = (v: number) => formatMoney(v, input.currency);

  const search = async () => {
    setAppliedDate(null);
    await run({
      origin: originCode.trim() || input.originCity.trim(),
      destination: destCode.trim() || input.destination.trim(),
      days: input.days,
      currency: input.currency,
      months,
    });
  };

  const apply = (deal: FlightDeal) => {
    onChange({ flightPricePerPerson: deal.price, costStatus: { ...input.costStatus, flight: "estimated" } });
    setAppliedDate(deal.departDate);
  };

  const inputClass =
    "w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs uppercase text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

  return (
    <div className="space-y-2 border-t border-slate-200 pt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={search}
          disabled={!canRun || state.status === "loading"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarSearch className="h-4 w-4" aria-hidden />}
          {state.status === "loading" ? "항공 시세 조회 중..." : "가장 싼 출발일 찾기 (실제 시세)"}
        </button>
        <label className="flex items-center gap-1 text-[11px] text-slate-600">
          앞으로
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700"
          >
            {[3, 4, 6].map((m) => (
              <option key={m} value={m}>
                {m}개월
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="text-[11px] text-slate-500">
        <summary className="cursor-pointer">공항 코드를 직접 지정 (결과가 이상할 때)</summary>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            출발
            <input aria-label="출발 공항 코드" value={originCode} maxLength={3} placeholder="SEL" onChange={(e) => setOriginCode(e.target.value)} className={inputClass} />
          </label>
          <label className="flex items-center gap-1">
            도착
            <input aria-label="도착 공항 코드" value={destCode} maxLength={3} placeholder="BKK" onChange={(e) => setDestCode(e.target.value)} className={inputClass} />
          </label>
          <span>비워 두면 입력한 도시 이름으로 자동 인식합니다.</span>
        </div>
      </details>

      {state.status === "error" && (
        <ErrorBanner title="항공 시세를 가져오지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={search} />
      )}

      {state.status === "success" && result && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-4 text-slate-700">
          <p className="font-semibold text-slate-800">
            {result.origin.label} → {result.destination.label} 왕복 · 출발일 기준 {result.tripDays}일 뒤 귀국
          </p>

          {result.deals.length === 0 ? (
            <p className="text-slate-500">
              이 노선과 기간에 저장된 요금이 없습니다. 개월 수를 늘리거나 공항 코드를 바꿔 보세요. (캐시 데이터라 인기 없는 노선은 비어 있을 수 있어요.)
            </p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {result.deals.map((deal, i) => (
                  <li key={deal.departDate} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                    <span className="w-28 tabular-nums">
                      {shortDate(deal.departDate)} → {shortDate(deal.returnDate)}
                    </span>
                    <span className="w-24 font-semibold tabular-nums text-slate-900">{money(deal.price)}</span>
                    <span className={deal.transfers === 0 ? "font-medium text-emerald-700" : "text-slate-500"}>{stops(deal)}</span>
                    {deal.airline && <span className="text-slate-500">{deal.airline}</span>}
                    {i === 0 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">최저가</span>}
                    {isStale(deal) && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">오래된 데이터</span>}
                    <button
                      type="button"
                      onClick={() => apply(deal)}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      {appliedDate === deal.departDate ? <Check className="h-3 w-3" aria-hidden /> : null}
                      {appliedDate === deal.departDate ? "적용됨" : "이 요금 적용"}
                    </button>
                  </li>
                ))}
              </ul>

              {result.byMonth.length > 1 && (
                <p className="text-slate-500">
                  월별 최저가:{" "}
                  {result.byMonth.map(({ month, deal }) => `${Number(month.slice(5))}월 ${money(deal.price)}`).join(" · ")}
                </p>
              )}
            </>
          )}

          {appliedDate && (
            <p role="status" className="font-medium text-indigo-700">
              {shortDate(appliedDate)} 출발 요금을 왕복 항공료에 넣고 &quot;추정&quot;으로 표시했습니다.
            </p>
          )}
          <p className="text-slate-400">
            Aviasales(Travelpayouts)가 최근 검색된 요금을 모아 둔 최저가입니다. 실제 예약 가능 여부와 요금은 다를 수 있으니 판매 전에 항공 검색으로 확인하세요.
            요금은 견적 통화({input.currency}) 기준으로 조회했으며, 금액이 이상하면 Google Flights와 비교해 보세요.
          </p>
        </div>
      )}
    </div>
  );
}
