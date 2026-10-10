"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useHideCosts } from "@/components/SessionContext";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { formatMoney } from "@/lib/currency";
import type { PmChoice } from "@/lib/itinerary";
import { loadPriceRules, savePriceRules, seriesDates, seriesRows, seriesTsv, type PriceRule } from "@/lib/seriesPricing";
import type { DayPlan, TripInput } from "@/types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const fieldClass = "rounded border border-slate-300 bg-white px-1.5 py-1 text-xs tabular-nums focus:border-indigo-500 focus:outline-none";

/** 한국 공휴일 (서버가 공개 데이터에서 받아 보관) */
function useKoreanHolidays(years: number[]): { date: string; name: string }[] {
  const key = years.join(",");
  const [list, setList] = useState<{ key: string; items: { date: string; name: string }[] }>({ key: "", items: [] });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void Promise.all(
      key.split(",").map((y) =>
        fetch(`/api/holidays?country=${encodeURIComponent("한국")}&year=${y}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ holidays: { date: string; name: string }[] }>) : { holidays: [] }))
          .catch(() => ({ holidays: [] })),
      ),
    ).then((rs) => {
      if (alive) setList({ key, items: rs.flatMap((r) => r.holidays) });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return list.key === key ? list.items : [];
}

/**
 * 시리즈 출발 (회차별 판매가) · 할인 규칙 — 기간과 요일을 고르면 회차마다 판매가(업체 요일별 요금 반영)·연휴·조기 예약/임박 할인가를 한 표로.
 * 할인 규칙은 회사 기준으로 이 브라우저에 저장하고, 비교 견적서·웹 일정표에 안내 문구로 들어간다.
 */
export function SeriesPanel({ input, days, pmChoice }: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice }) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(input.departureDate) ? input.departureDate : new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(() => new Date(new Date(`${start}T00:00:00Z`).getTime() + 56 * 86_400_000).toISOString().slice(0, 10));
  const [weekdays, setWeekdays] = useState<number[]>(() => [new Date(`${start}T00:00:00Z`).getUTCDay()]);
  const [rules, setRules] = useState<PriceRule[]>(() => (typeof window === "undefined" ? [] : loadPriceRules()));
  const dates = useMemo(() => seriesDates(from, to, weekdays), [from, to, weekdays]);
  const years = [...new Set(dates.map((d) => Number(d.slice(0, 4))))];
  const holidays = useKoreanHolidays(years);
  const rows = useMemo(() => seriesRows(input, days, pmChoice, dates, rules, holidays), [input, days, pmChoice, dates, rules, holidays]);
  const money = (v: number) => formatMoney(Math.round(v), input.currency);
  const hideCosts = useHideCosts();
  const changeRules = (next: PriceRule[]) => {
    setRules(next);
    savePriceRules(next);
  };
  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          <span className="text-[11px] text-slate-500">첫 출발</span>
          <input type="date" aria-label="시리즈 첫 출발" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] text-slate-500">마지막 출발</span>
          <input type="date" aria-label="시리즈 마지막 출발" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
        </label>
        <div role="group" aria-label="출발 요일" className="flex gap-1">
          {WEEKDAYS.map((w, i) => (
            <button
              key={w}
              type="button"
              aria-pressed={weekdays.includes(i)}
              onClick={() => toggleDay(i)}
              className={`size-7 rounded-full border text-[11px] font-semibold ${weekdays.includes(i) ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600"}`}
            >
              {w}
            </button>
          ))}
        </div>
        <span className="text-slate-500">{dates.length}회</span>
      </div>

      <div className="space-y-1 rounded-md bg-slate-50 p-2.5">
        <p className="font-semibold text-slate-700">할인 규칙 (회사 기준)</p>
        {rules.map((r, i) => (
          <div key={r.id} className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label={`할인 규칙 ${i + 1} 종류`}
              value={r.kind}
              onChange={(e) => changeRules(rules.map((x) => (x.id === r.id ? { ...x, kind: e.target.value as PriceRule["kind"] } : x)))}
              className={fieldClass}
            >
              <option value="early">조기 예약 — 출발</option>
              <option value="late">출발 임박 — 출발</option>
            </select>
            <input
              type="number"
              min={1}
              aria-label={`할인 규칙 ${i + 1} 일수`}
              value={r.days}
              onChange={(e) => changeRules(rules.map((x) => (x.id === r.id ? { ...x, days: Math.max(1, Math.round(Number(e.target.value) || 1)) } : x)))}
              className={`${fieldClass} w-16`}
            />
            <span>{r.kind === "early" ? "일 전까지 예약 시" : "일 이내 예약 시"}</span>
            <input
              type="number"
              min={1}
              max={49}
              aria-label={`할인 규칙 ${i + 1} 할인율`}
              value={r.rate}
              onChange={(e) => changeRules(rules.map((x) => (x.id === r.id ? { ...x, rate: Math.min(49, Math.max(1, Number(e.target.value) || 1)) } : x)))}
              className={`${fieldClass} w-14`}
            />
            <span>% 할인</span>
            <button type="button" onClick={() => changeRules(rules.filter((x) => x.id !== r.id))} aria-label={`할인 규칙 ${i + 1} 지우기`} className="rounded p-1 text-slate-400 hover:text-rose-600">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => changeRules([...rules, { id: `r-${Date.now().toString(36)}`, kind: rules.some((r) => r.kind === "early") ? "late" : "early", days: rules.some((r) => r.kind === "early") ? 14 : 60, rate: rules.some((r) => r.kind === "early") ? 3 : 5 }])}
          className="inline-flex items-center gap-1 font-semibold text-indigo-700"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          할인 규칙 추가
        </button>
        <p className="text-[10px] text-slate-400">규칙은 비교 견적서·고객용 웹 일정표에 안내 문구로 들어갑니다. 할인가는 판매가에서 할인율만큼 내린 값(통화 단위 내림)입니다.</p>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <caption className="sr-only">회차별 판매가</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                <th className="py-1 pr-2 font-medium">출발</th>
                <th className="py-1 pr-2 font-medium">귀국</th>
                <th className="py-1 pr-2 text-right font-medium">1인 판매가</th>
                {rows[0].discounts.map((d) => (
                  <th key={d.rule.id} className="py-1 pr-2 text-right font-medium">
                    {d.rule.kind === "early" ? `조기 ${d.rule.rate}%` : `임박 ${d.rule.rate}%`}
                  </th>
                ))}
                <th className="py-1 font-medium">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {rows.map((r) => (
                <tr key={r.date} className={r.date === input.departureDate ? "bg-indigo-50/60 font-semibold" : ""}>
                  <td className="py-1 pr-2">
                    {r.date} ({r.weekday})
                  </td>
                  <td className="py-1 pr-2 text-slate-500">{r.returnDate.slice(5)}</td>
                  <td className="py-1 pr-2 text-right">
                    {r.salePrice === null ? "—" : money(r.salePrice)}
                    {r.marginRate !== null && !hideCosts && <span className="block text-[10px] font-normal text-slate-400">수익률 {r.marginRate.toFixed(1)}%</span>}
                  </td>
                  {r.discounts.map((d) => (
                    <td key={d.rule.id} className="py-1 pr-2 text-right">
                      {money(d.price)}
                      <span className="block text-[10px] font-normal text-slate-400">{d.rule.kind === "early" ? `~${d.until.slice(5)} 예약` : `${d.until.slice(5)}부터`}</span>
                    </td>
                  ))}
                  <td className="py-1 text-[11px]">
                    {r.priceLabel && <span className="mr-1 text-slate-500">{r.priceLabel}</span>}
                    {r.holidays.length > 0 && <span className="rounded bg-rose-50 px-1 font-semibold text-rose-700">연휴: {r.holidays.join(", ")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton label="회차표 복사 (엑셀)" variant="secondary" disabled={rows.length === 0} getText={() => seriesTsv(rows)} />
        <span className="text-[11px] text-slate-500">연휴는 한국 공휴일이 여행 기간에 걸친 회차입니다 — 항공·호텔 요금이 오를 수 있어 확인하세요.</span>
      </div>
    </div>
  );
}
