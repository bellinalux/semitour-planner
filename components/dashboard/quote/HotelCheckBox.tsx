"use client";

import { Hotel, Loader2 } from "lucide-react";
import { useState } from "react";
import { postJson } from "@/lib/api";
import type { HotelCheckResult, SupplierQuote } from "@/types";

interface Props {
  destination: string;
  q: SupplierQuote;
  onSave: (checks: HotelCheckResult[]) => void;
}

/**
 * 견적서 호텔 확인 — 업체 견적서에 적힌 호텔이 실제로 있는지, 정식 이름·등급(업체 표기와 같은지)·위치·한국인 이용·
 * 국내 여행사 패키지 사용을 웹에서 확인한다. 결과는 회사 요금표에도 남는다.
 */
export function HotelCheckBox({ destination, q, onSave }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const names = q.hotelNames ?? [];
  if (names.length === 0) return null;
  const checks = q.hotelChecks ?? [];

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ checks: HotelCheckResult[] }>("/api/rates/check-hotels", { destination, names: names.slice(0, 6), claimedGrade: (q.hotels ?? "").slice(0, 40) });
      onSave(r.checks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="견적서 호텔 확인" className="space-y-1.5 rounded-md border border-slate-200 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Hotel className="h-3.5 w-3.5 text-slate-500" aria-hidden />
        <b className="text-slate-800">견적서 호텔 확인</b>
        <span className="text-[11px] text-slate-500">실재·등급·위치·한국인 이용·국내 여행사 패키지 사용</span>
        <button type="button" disabled={busy} onClick={() => void run()} className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {checks.length > 0 ? "다시 확인" : `호텔 ${names.length}곳 확인`}
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {checks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-0.5 pr-2 font-medium">호텔</th>
                <th className="py-0.5 pr-2 font-medium">실재</th>
                <th className="py-0.5 pr-2 font-medium">등급</th>
                <th className="py-0.5 pr-2 font-medium">위치</th>
                <th className="py-0.5 pr-2 font-medium">한국인 · 여행사</th>
                <th className="py-0.5 font-medium">주의</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {checks.map((c) => (
                <tr key={c.name}>
                  <td className="py-1 pr-2">
                    <b className="text-slate-800">{c.name}</b>
                    {c.officialName && c.officialName !== c.name && <span className="block text-[10.5px] text-slate-400">{c.officialName}</span>}
                  </td>
                  <td className={`py-1 pr-2 font-semibold ${c.exists ? "text-emerald-700" : "text-rose-700"}`}>{c.exists ? "확인" : "확인 못함"}</td>
                  <td className="py-1 pr-2">
                    {c.grade || "—"}
                    {q.hotels && c.grade && <span className="block text-[10.5px] text-slate-400">업체 표기: {q.hotels.slice(0, 30)}</span>}
                  </td>
                  <td className="py-1 pr-2 text-pretty">{[c.area, c.location].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="py-1 pr-2 text-pretty">
                    {c.korean ? <span className="text-emerald-700">한국인 이용 확인</span> : <span className="text-slate-400">확인 못함</span>}
                    {c.agencies.length > 0 && <span className="block text-[10.5px] text-indigo-700">{c.agencies.join(", ")} 패키지</span>}
                  </td>
                  <td className={`py-1 text-pretty ${c.note ? "text-amber-800" : "text-slate-400"}`}>{c.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10.5px] text-slate-400">확인 결과와 견적서의 호텔 1박 금액은 회사 요금표에 쌓여, 다음 견적은 요금표부터 봅니다 (업체 견적가 6개월·웹 시세 30일).</p>
    </section>
  );
}
