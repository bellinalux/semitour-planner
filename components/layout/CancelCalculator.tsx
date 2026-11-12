"use client";

import { Calculator } from "lucide-react";
import { useState } from "react";
import { useKoreanHolidays } from "@/hooks/useKoreanHolidays";
import { cancelQuote, dateLabel, type CancelPolicy } from "@/lib/cancelPolicy";
import { formatMoney } from "@/lib/currency";
import type { CurrencyCode } from "@/types";

const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const nowClock = () => new Date().toTimeString().slice(0, 5);

/**
 * 예약 취소료 계산 — 취소 통보 날짜·시각으로 그날 구간의 취소료와 환불액(또는 더 받을 돈)을 바로 계산한다.
 * 영업일 기준 규정이면 업무 종료 뒤·휴일 통보는 다음 영업일 접수로 본다. 항공권을 발권했으면 항공 취소 수수료를 더한다.
 */
export function CancelCalculator({
  policy,
  departureDate,
  total,
  deposit,
  paid,
  travelers,
  currency,
  airFeePerPerson,
  onRecord,
}: {
  policy: CancelPolicy;
  departureDate: string;
  total: number;
  deposit: number;
  paid: number;
  travelers: number;
  currency: CurrencyCode;
  airFeePerPerson: number;
  /** 계산 결과를 메모에 남기기 */
  onRecord?: (line: string) => void;
}) {
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState(nowClock);
  const [ticketed, setTicketed] = useState(false);
  const holidays = useKoreanHolidays(departureDate);
  const money = (v: number) => formatMoney(v, currency);
  const q = departureDate ? cancelQuote(policy, { departureDate, noticeDate: date, noticeTime: time, total, deposit, paid, travelers, airFeePerPerson, ticketed, holidays }) : null;
  const line = q
    ? `${dateLabel(date)} ${time} 취소 통보 → 출발 ${q.daysBefore}일 전 구간, 취소료 ${money(q.fee)}${q.refund > 0 ? ` · 환불 ${money(q.refund)}` : ""}${q.owed > 0 ? ` · 추가 청구 ${money(q.owed)}` : ""}${q.note ? ` (${q.note})` : ""}`
    : "";

  return (
    <section aria-label="취소료 계산" className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-[11px] text-slate-700">
      <p className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
        <Calculator className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        취소료 계산 ({policy.mode === "custom" ? "특별약관" : "표준약관"})
      </p>
      {!departureDate ? (
        <p className="text-slate-500">출발일을 넣으면 계산합니다.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              취소 통보
              <input type="date" aria-label="취소 통보 날짜" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-slate-300 px-1 py-0.5" />
              <input type="time" aria-label="취소 통보 시각" value={time} onChange={(e) => setTime(e.target.value)} className="rounded border border-slate-300 px-1 py-0.5" />
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={ticketed} onChange={(e) => setTicketed(e.target.checked)} />
              항공권 발권함
            </label>
          </div>
          {q && (
            <p role="status" className="rounded bg-white px-2 py-1.5">
              출발 <b>{q.daysBefore}일 전</b> 구간 · 취소료 <b>{money(q.fee)}</b>
              {" · "}
              {q.owed > 0 ? (
                <span className="text-rose-700">받은 돈보다 많아 {money(q.owed)} 추가 청구</span>
              ) : (
                <span className="text-emerald-700">환불 {money(q.refund)}</span>
              )}
              {q.note && <span className="block text-slate-500">{q.note}</span>}
            </p>
          )}
          {q && onRecord && (
            <button type="button" onClick={() => onRecord(line)} className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-50">
              메모에 남기기
            </button>
          )}
        </>
      )}
    </section>
  );
}
