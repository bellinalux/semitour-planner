"use client";

import { AlertTriangle, Check, ClipboardCopy, HelpCircle, Minus } from "lucide-react";
import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import type { CheckItem, Level, SupplierVerify } from "@/lib/supplierVerify";
import type { CurrencyCode } from "@/types";

interface Props {
  verify: SupplierVerify;
  currency: CurrencyCode;
  /** 시세가 없을 때 자동 견적으로 시세를 조회한다 */
  market: { run: () => void; running: boolean };
}

const LEVEL: Record<Level, { label: string; tone: string }> = {
  high: { label: "높음", tone: "bg-red-50 text-red-700" },
  ok: { label: "적정", tone: "bg-emerald-50 text-emerald-700" },
  low: { label: "낮음", tone: "bg-amber-50 text-amber-700" },
  unknown: { label: "모름", tone: "bg-slate-100 text-slate-500" },
};

const STATE: Record<CheckItem["state"], { label: string; icon: typeof Check; tone: string }> = {
  included: { label: "포함", icon: Check, tone: "text-emerald-700" },
  excluded: { label: "불포함", icon: Minus, tone: "text-red-700" },
  missing: { label: "안 적힘", icon: HelpCircle, tone: "text-amber-700" },
};

/** 업체 견적 검증표 — 계산 확인, 우리 시세와 비교, 포함·불포함 체크, 업체에 물어볼 질문 */
export function SupplierVerifyTable({ verify, currency, market }: Props) {
  const [copied, setCopied] = useState(false);
  const money = (v: number | null) => (v === null ? "—" : formatMoney(Math.round(v), currency));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verify.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3 text-[11px]">
      {verify.calcIssues.length > 0 && (
        <ul className="space-y-1">
          {verify.calcIssues.map((issue) => (
            <li key={issue} className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 leading-4 text-amber-800">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span className="text-pretty">{issue}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[480px]">
          <caption className="sr-only">업체 견적 시세 비교</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <th scope="col" className="px-2 py-1.5 font-medium">
                항목 (1인)
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                업체
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                우리 시세
              </th>
              <th scope="col" className="px-2 py-1.5 font-medium">
                판정
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums text-slate-700">
            {[...verify.rows, verify.total].map((r) => (
              <tr key={r.key} className={r.key === "total" ? "bg-slate-50 font-semibold text-slate-900" : ""}>
                <th scope="row" className="px-2 py-1.5 text-left font-medium">
                  {r.label}
                </th>
                <td className="px-2 py-1.5 text-right">{money(r.supplier)}</td>
                <td className="px-2 py-1.5 text-right">{money(r.market)}</td>
                <td className="px-2 py-1.5">
                  <span className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${LEVEL[r.level].tone}`}>{LEVEL[r.level].label}</span>
                  <span className="text-pretty font-normal text-slate-500">{r.note}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {verify.supplierShare && (
        <p className="text-pretty text-slate-600">
          {verify.supplierShare.amount >= 0 ? (
            <>
              업체 몫 추정 (공급가 − 우리 시세 원가):{" "}
              <b className="tabular-nums text-slate-900">
                1인 {money(verify.supplierShare.amount)} · 공급가의 {verify.supplierShare.rate.toFixed(0)}%
              </b>
            </>
          ) : verify.supplierShare.rate >= -5 ? (
            <>
              공급가가 우리 시세 원가와 거의 같습니다 (<b className="tabular-nums text-slate-900">1인 {money(-verify.supplierShare.amount)}</b> 낮음) — 업체는 공개 요금보다 싼 단체·도매 요금으로 사서 마진을 남기는 구조로 보입니다.
            </>
          ) : (
            <>
              우리 시세 원가가 공급가보다 <b className="tabular-nums text-slate-900">1인 {money(-verify.supplierShare.amount)}</b> 높습니다 — 업체가 단체·도매 요금을 받거나 빠진 항목이 있을 수 있습니다.
            </>
          )}
          <span className="block text-slate-400">
            {verify.supplierShare.hotelsFound > 0 ? `숙박은 견적서 호텔 ${verify.supplierShare.hotelsFound}곳의 웹 공개 요금 평균입니다. ` : "숙박은 호텔 등급 평균 시세입니다. "}
            업체가 받는 단체·도매 요금은 공개 요금보다 낮은 편이라, 실제 업체 몫은 이보다 클 수 있습니다.
          </span>
        </p>
      )}
      {!verify.marketReady && (
        <div className="flex flex-wrap items-center gap-2 text-slate-500">
          <span className="flex-1">우리 시세(차량·가이드·숙박)를 조회하면 업체 금액과 비교합니다.</span>
          <button
            type="button"
            onClick={market.run}
            disabled={market.running}
            className="rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
          >
            {market.running ? "시세 조회 중..." : "시세 조회"}
          </button>
        </div>
      )}

      {verify.checklist.length > 0 && (
        <div>
          <p className="mb-1 font-semibold text-slate-700">포함·불포함 확인</p>
          <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {verify.checklist.map((c) => {
              const s = STATE[c.state];
              const Icon = s.icon;
              return (
                <li key={c.key} className="flex items-start gap-1.5">
                  <Icon className={`mt-0.5 size-3.5 shrink-0 ${s.tone}`} aria-hidden />
                  <span className="flex-1">
                    {c.label} <span className={`font-semibold ${s.tone}`}>{s.label}</span>
                    {c.evidence && <span className="text-slate-400"> · {c.evidence}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {verify.questions.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-700">업체에 물어볼 것 ({verify.questions.length})</p>
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ClipboardCopy className="size-3.5" aria-hidden />
              {copied ? "복사했습니다" : "질문 복사"}
            </button>
          </div>
          <ol className="list-decimal space-y-0.5 pl-4 text-pretty text-slate-700">
            {verify.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
