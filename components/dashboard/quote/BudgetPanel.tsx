import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { BudgetPlan } from "@/lib/budget";
import { formatMoney } from "@/lib/currency";
import type { CurrencyCode } from "@/types";

/**
 * 예산 사용표 — 판매가(또는 B2B 도매가)에서 시작한 견적에서, 항목마다 예산(1인)과 지금 원가(1인)를 나란히 보여 준다.
 * 예산을 넘으면 얼마나 넘었는지와, 목표 수익을 지키려면 필요한 최소 판매가를 알려 준다.
 */
export function BudgetPanel({ plan, currency }: { plan: BudgetPlan; currency: CurrencyCode }) {
  const money = (v: number) => formatMoney(v, currency);
  const over = plan.gap !== null && plan.gap < 0;

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-4 text-slate-500">
        {plan.mode === "wholesale" ? "거래처 도매가" : "1인 판매가"} {money(plan.pricePerPerson)}
        {plan.feePerPerson > 0 ? ` − ${plan.channelName} 수수료 ${money(plan.feePerPerson)}` : ""} − 회사 수익 {money(plan.profitPerPerson)} ={" "}
        <span className="font-semibold text-slate-800">1인 원가 예산 {money(plan.budgetPerPerson)}</span> (2인 1실 기준)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <caption className="sr-only">예산 사용표</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
              <th className="py-1.5 pr-3 font-medium">항목 (1인)</th>
              <th className="py-1.5 pr-3 text-right font-medium">예산</th>
              <th className="py-1.5 pr-3 text-right font-medium">지금 원가</th>
              <th className="py-1.5 text-right font-medium">차이</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {plan.categories.map((c) => {
              const diff = c.actual === null ? null : c.budget - c.actual;
              return (
                <tr key={c.key}>
                  <td className="py-1.5 pr-3 text-slate-700">
                    {c.label}
                    {c.known && c.key !== "etc" && <span className="ml-1 text-[10px] text-slate-400">입력값</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-slate-700">{money(c.budget)}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-700">{c.actual === null ? "—" : money(c.actual)}</td>
                  <td className={`py-1.5 text-right ${diff === null ? "text-slate-400" : diff < -0.5 ? "text-red-600" : "text-emerald-700"}`}>
                    {diff === null ? "—" : `${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))}`}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-semibold text-slate-900">
              <td className="py-1.5 pl-2 pr-3">합계</td>
              <td className="py-1.5 pr-3 text-right">{money(plan.budgetPerPerson)}</td>
              <td className="py-1.5 pr-3 text-right">{plan.actualPerPerson === null ? "—" : money(plan.actualPerPerson)}</td>
              <td className={`py-1.5 pr-2 text-right ${over ? "text-red-600" : "text-emerald-700"}`}>
                {plan.gap === null ? "—" : `${plan.gap >= 0 ? "+" : "−"}${money(Math.abs(plan.gap))}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {plan.gap !== null &&
        (over ? (
          <p className="flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-[11px] leading-4 text-red-700">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              1인 원가가 예산보다 {money(-plan.gap)} 많아, 이 가격으로 팔면 회사 수익이 목표보다 줄어듭니다.
              {plan.minPriceNeeded !== null && ` 목표 수익을 지키려면 1인 ${money(plan.minPriceNeeded)} 이상이 필요합니다.`} 빨간 항목부터 줄이세요.
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-[11px] leading-4 text-emerald-800">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              예산 안입니다. 1인 {money(plan.gap)}이 남습니다 — 숙소·투어를 한 단계 올리거나, 그대로 두면 회사 이익으로 남습니다.
            </span>
          </p>
        ))}

      {(plan.caps.roomPerNight !== null || plan.caps.admissionPerPerson > 0) && (
        <p className="text-[11px] leading-4 text-slate-500">
          예산 안에서 고르는 기준:
          {plan.caps.roomPerNight !== null && ` 숙소 1실 1박 ${money(plan.caps.roomPerNight)} 이하(2인 1실) ·`} 1인 입장·체험·투어 {money(plan.caps.admissionPerPerson)} · 1인 식사{" "}
          {money(plan.caps.mealPerPerson)}
        </p>
      )}
    </div>
  );
}
