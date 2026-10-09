"use client";

import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { buildCostSheet, costSheetTable } from "@/lib/costSheet";
import { formatMoney } from "@/lib/currency";
import type { PmChoice } from "@/lib/itinerary";
import type { DayPlan, QuoteData, TripInput } from "@/types";

interface Props {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteData;
  title: string;
}

/** 원가 계산서 — 여행사 원가표 형식(단가 × 수량 = 금액, 1인 금액, 출처)으로 펼쳐 보고 엑셀로 내려받는다 */
export function CostSheetPanel({ input, days, pmChoice, quote, title }: Props) {
  const [error, setError] = useState<string | null>(null);
  const sheet = buildCostSheet(input, days, pmChoice, quote);
  const money = (v: number) => formatMoney(Math.round(v), input.currency);
  const conditions = `${input.destination} ${input.nights}박 ${input.days}일 · ${quote.travelers}명 · 1인 요금 2인 1실 기준 · ${input.currency}`;

  const download = async () => {
    setError(null);
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet(costSheetTable(sheet, `${title} 원가 계산서`, conditions));
      ws["!cols"] = [{ wch: 10 }, { wch: 36 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 24 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "원가 계산서");
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `${title.replace(/[\\/:*?"<>|]/g, " ").trim()} 원가계산서 ${date}.xlsx`);
    } catch {
      setError("엑셀 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-pretty text-[11px] leading-4 text-slate-500">
          1인 원가 <span className="font-semibold tabular-nums text-slate-800">{money(sheet.perPerson)}</span> · 총 원가{" "}
          <span className="tabular-nums">{money(sheet.total)}</span> (2인 1실 기준) — 항목 {sheet.rows.length}개
        </p>
        <button
          type="button"
          onClick={() => void download()}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
          엑셀로 내려받기
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-red-600">
          {error}
        </p>
      )}
      <details className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-700">원가 계산서 펼치기 (단가 × 수량 = 금액)</summary>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[640px] text-[11px]">
            <caption className="sr-only">원가 계산서</caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <th className="px-2 py-1.5 font-medium">구분</th>
                <th className="px-2 py-1.5 font-medium">항목</th>
                <th className="px-2 py-1.5 text-right font-medium">단가</th>
                <th className="px-2 py-1.5 font-medium">수량</th>
                <th className="px-2 py-1.5 text-right font-medium">금액</th>
                <th className="px-2 py-1.5 text-right font-medium">1인</th>
                <th className="px-2 py-1.5 font-medium">확정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums text-slate-700">
              {sheet.rows.map((r, i) => (
                <tr key={`${r.group}-${r.item}-${i}`} className={r.excluded ? "text-slate-400 line-through" : ""}>
                  <td className="px-2 py-1.5 text-slate-500">{r.group}</td>
                  <td className="px-2 py-1.5">
                    {r.item}
                    {r.source && <span className="block text-[10px] text-slate-400">{r.source}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right">{r.unitPrice === null ? "—" : money(r.unitPrice)}</td>
                  <td className="px-2 py-1.5">{r.qty}</td>
                  <td className="px-2 py-1.5 text-right">{money(r.amount)}</td>
                  <td className="px-2 py-1.5 text-right">{money(r.perPerson)}</td>
                  <td className={`px-2 py-1.5 ${r.status === "추정" ? "text-amber-700" : "text-slate-500"}`}>{r.status}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold text-slate-900">
                <td className="px-2 py-1.5" colSpan={4}>
                  합계
                </td>
                <td className="px-2 py-1.5 text-right">{money(sheet.total)}</td>
                <td className="px-2 py-1.5 text-right">{money(sheet.perPerson)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 px-3 py-2 text-[11px] sm:grid-cols-3">
            {sheet.summary.map((s) => (
              <div key={s.label} className="flex justify-between gap-2">
                <dt className="text-slate-500">{s.label}</dt>
                <dd className="font-semibold tabular-nums text-slate-800">{typeof s.value === "number" ? money(s.value) : s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}
