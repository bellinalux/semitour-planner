"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { loadSupplierHistory, removeSupplierRecord, sameDestination, supplierTrends, syncSupplierHistory, updateSupplierRecord, type SupplierRecord } from "@/lib/supplierHistory";
import type { TripInput } from "@/types";

/** 업체 견적 기록이 바뀌면 (새로 읽음) 화면을 다시 읽게 알린다 */
export const SUPPLIER_HISTORY_EVENT = "semitour:supplier-history";

/**
 * 업체 견적 기록·비교 — 같은 여행지로 받은 업체 견적을 한 표에서 견주고(공급가·요일별 범위·호텔·최소 인원·포함),
 * 같은 업체의 지난 요금과 견준 변화(원문 통화 기준)를 보여 준다. 업체 이름은 고칠 수 있다.
 */
export function SupplierHistoryPanel({ input }: { input: TripInput }) {
  const [list, setList] = useState<SupplierRecord[]>([]);
  const [shared, setShared] = useState(false);
  useEffect(() => {
    let alive = true;
    // 먼저 이 브라우저 기록을 보여 주고, 팀 서버와 맞춘 뒤 다시 그린다
    const load = () => {
      setList(loadSupplierHistory());
      void syncSupplierHistory().then((r) => {
        if (!alive) return;
        setList(r.list);
        setShared(r.shared);
      });
    };
    load();
    window.addEventListener(SUPPLIER_HISTORY_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(SUPPLIER_HISTORY_EVENT, load);
    };
  }, []);
  const change = (next: SupplierRecord[], removed: string[] = []) => {
    setList(next);
    void syncSupplierHistory(removed).then((r) => setList(r.list));
  };
  const rows = sameDestination(list, input.destination);
  if (rows.length === 0) return null;
  const trends = supplierTrends(rows).filter((t) => t.changePct !== 0);
  const currentPrice = input.pricingMode === "supplier" ? input.supplierPricePerPerson : 0;
  const money = (v: number, c = input.currency) => formatMoney(Math.round(v), c);
  const cheapest = Math.min(...rows.filter((r) => r.nights === input.nights && r.currency === input.currency).map((r) => r.pricePerPerson), Infinity);

  return (
    <section aria-label="업체 견적 기록" className="space-y-2 rounded-lg border border-slate-200 p-3 text-[11px] leading-4">
      <p className="font-semibold text-slate-800">
        업체 견적 기록 · 비교 <span className="font-normal text-slate-500">— {input.destination} 관련 {rows.length}건 ({shared ? "팀 공용" : "이 브라우저"})</span>
      </p>
      {trends.length > 0 && (
        <ul className="space-y-0.5">
          {trends.map((t) => (
            <li key={`${t.supplier}-${t.latest.nights}`} className={t.changePct > 0 ? "text-rose-700" : "text-emerald-700"}>
              {t.supplier} {t.latest.nights}박: 지난번 {t.previous.originalPrice.toLocaleString()} → 이번 {t.latest.originalPrice.toLocaleString()} {t.latest.originalCurrency} ({t.changePct > 0 ? "+" : ""}
              {t.changePct}%, {t.previous.at.slice(0, 10)} 대비)
            </li>
          ))}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">업체</th>
              <th className="py-1 pr-2 font-medium">받은 날</th>
              <th className="py-1 pr-2 font-medium">일정</th>
              <th className="py-1 pr-2 text-right font-medium">1인 공급가</th>
              <th className="py-1 pr-2 text-right font-medium">요일별 범위</th>
              <th className="py-1 pr-2 font-medium">호텔 · 최소 인원</th>
              <th className="py-1 pr-2 font-medium">포함 / 불포함</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {rows.map((r) => {
              const isNow = currentPrice > 0 && r.pricePerPerson === currentPrice && r.nights === input.nights;
              const diff = currentPrice > 0 && r.currency === input.currency && r.nights === input.nights && !isNow ? r.pricePerPerson - currentPrice : null;
              return (
                <tr key={r.id} className={isNow ? "bg-indigo-50/60" : ""}>
                  <td className="py-1 pr-2">
                    <input
                      aria-label="업체 이름"
                      defaultValue={r.supplier}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== r.supplier) change(updateSupplierRecord(list, r.id, { supplier: v }));
                      }}
                      className="w-28 rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold text-slate-800 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
                    />
                    {isNow && <span className="ml-1 rounded bg-indigo-600 px-1 text-[10px] text-white">지금</span>}
                    {r.pricePerPerson === cheapest && r.nights === input.nights && rows.length > 1 && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">최저</span>}
                    <span className="block truncate text-[10px] text-slate-400" title={r.fileName}>
                      {r.packageName || r.fileName}
                    </span>
                  </td>
                  <td className="py-1 pr-2">{r.at.slice(0, 10)}</td>
                  <td className="py-1 pr-2">
                    {r.nights}박 {r.days}일
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {money(r.pricePerPerson, r.currency)}
                    <span className="block text-[10px] text-slate-400">
                      {r.originalPrice.toLocaleString()} {r.originalCurrency}
                    </span>
                    {diff !== null && diff !== 0 && <span className={`block text-[10px] ${diff > 0 ? "text-rose-600" : "text-emerald-700"}`}>지금보다 {diff > 0 ? "+" : "−"}{money(Math.abs(diff))}</span>}
                  </td>
                  <td className="py-1 pr-2 text-right">{r.priceLow === r.priceHigh ? "—" : `${money(r.priceLow, r.currency)}~${money(r.priceHigh, r.currency)}`}</td>
                  <td className="py-1 pr-2">
                    <span className="line-clamp-2 text-pretty">{r.hotels.join(", ") || "—"}</span>
                    {r.minTravelers > 0 && <span className="text-slate-500">최소 {r.minTravelers}명</span>}
                  </td>
                  <td className="py-1 pr-2">
                    <span title={`포함: ${r.includes.join(", ")}\n불포함: ${r.excludes.join(", ")}`}>
                      {r.includes.length} / {r.excludes.length}
                    </span>
                    {r.shopping && <span className="block truncate text-[10px] text-slate-400">{r.shopping}</span>}
                  </td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`${r.supplier} 견적 기록을 지울까요?`)) change(removeSupplierRecord(list, r.id), [r.id]);
                      }}
                      aria-label={`${r.supplier} 기록 지우기`}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-slate-400">업체 견적서를 읽을 때마다 자동으로 쌓입니다. 여러 업체에 같은 코스로 견적을 받아 올리면 이 표에서 견줄 수 있습니다. 포함/불포함은 개수이며, 칸에 마우스를 올리면 내용이 보입니다.</p>
    </section>
  );
}
