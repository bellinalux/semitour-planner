"use client";

import { Check, Loader2, PlaneTakeoff } from "lucide-react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useRequest } from "@/hooks/useRequest";
import { formatMoney } from "@/lib/currency";
import { tripSpanFromFlight } from "@/lib/flightApply";
import type { FlightOption } from "@/types";
import type { SectionProps } from "./types";

interface Result {
  flights: FlightOption[];
  searched: boolean;
}

const SHOW = 5;

function shortDate(iso: string): string {
  return iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : "날짜 미상";
}

/**
 * 코스를 만들기 전에 왕복 항공편을 바로 조회해 고른다. 고르면 출발일·여행 일수·숙박 수를
 * 실제 출국·귀국 시각으로 계산해 맞추고, 항공료와 항공 이동일도 함께 넣는다.
 */
export function FlightQuickPick({ input, onApplyFlight }: Pick<SectionProps, "input"> & { onApplyFlight: (flight: FlightOption) => void }) {
  const { state, data, run } = useRequest<
    { origin: string; destination: string; days: number; nights: number; departureDate: string; currency: string },
    Result
  >("/api/search-flight-options");
  const canRun = input.destination.trim() !== "" && input.originCity.trim() !== "" && input.days >= 2;
  const money = (v: number) => formatMoney(v, input.currency);

  const search = () =>
    run({
      origin: input.originCity.trim(),
      destination: input.destination.trim(),
      days: input.days,
      nights: input.nights,
      departureDate: input.departureDate,
      currency: input.currency,
    });

  const flights = (data?.flights ?? [])
    .filter((f) => f.departDate && f.returnDepartDate)
    .sort((a, b) => (a.price || Number.MAX_SAFE_INTEGER) - (b.price || Number.MAX_SAFE_INTEGER))
    .slice(0, SHOW);
  const selected = input.selectedFlight;
  const isSelected = (f: FlightOption) =>
    !!selected && selected.flightNumber === f.flightNumber && selected.departDate === f.departDate && selected.returnDepartDate === f.returnDepartDate;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void search()}
          disabled={!canRun || state.status === "loading"}
          className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <PlaneTakeoff className="h-3.5 w-3.5" aria-hidden />}
          {state.status === "loading" ? "항공편 찾는 중... (1분 정도)" : "항공편 조회해서 일정 맞추기"}
        </button>
        {!canRun && <span className="text-[11px] text-slate-500">여행지·출발지·일수를 먼저 넣으세요.</span>}
      </div>
      <p className="text-[11px] leading-4 text-slate-500">
        고르면 출국·귀국 시각으로 숙박 수와 일수를 맞춥니다 (새벽 도착편은 전날 밤부터, 새벽 출발 귀국편은 전날 밤 숙박 없이 계산).
      </p>

      {state.status === "error" && <ErrorBanner title="항공편을 찾지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={() => void search()} />}

      {state.status === "success" && flights.length === 0 && (
        <p className="text-[11px] text-slate-500">날짜가 확인된 항공편을 찾지 못했습니다. 출발일을 넣고 다시 조회해 보세요.</p>
      )}

      {flights.length > 0 && (
        <ul className="space-y-1.5">
          {flights.map((f, i) => {
            const span = tripSpanFromFlight(f);
            const picked = isSelected(f);
            return (
              <li key={`${f.flightNumber}-${f.departDate}-${i}`} className={`rounded-md bg-white p-2.5 text-[11px] leading-4 ring-1 ${picked ? "ring-indigo-500" : "ring-slate-200"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {f.airline} {f.flightNumber}
                    <span className="ml-1 font-normal text-slate-500">{f.stops === 0 ? "직항" : `경유 ${f.stops}회`}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">{f.price > 0 ? money(f.price) : "요금 미확인"}</span>
                </div>
                <p className="text-slate-600">
                  가는 편 {shortDate(f.departDate)} {f.departTime} → {f.arriveTime} · 귀국편 {shortDate(f.returnDepartDate)} {f.returnDepartTime} → {f.returnArriveTime}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-slate-500">{span ? `${span.nights}박 ${span.days}일로 맞춤` : "날짜를 확인할 수 없어 일정은 그대로 둡니다"}</span>
                  <button
                    type="button"
                    onClick={() => onApplyFlight(f)}
                    className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    {picked ? <Check className="h-3 w-3" aria-hidden /> : null}
                    {picked ? "선택됨" : "이 항공편으로"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data && !data.searched && <p className="text-[11px] text-amber-700">웹 검색 근거를 확보하지 못한 추정 결과입니다. 예약 전에 항공사·예약처에서 확인하세요.</p>}
    </div>
  );
}
