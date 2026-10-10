"use client";

import { GitCompare } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatMoney } from "@/lib/currency";
import { changeNotice, diffVersions, type QuoteVersion } from "@/lib/quoteVersions";
import type { CurrencyCode } from "@/types";

interface Props {
  versions: QuoteVersion[];
  currency: CurrencyCode;
  customer: string;
  onSaveNow: () => void;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * 견적 버전 비교 — 고객에게 나간 견적(문서 인쇄 때 자동 저장)과 직접 저장한 버전 중 두 개를 골라 바뀐 점(가격·날짜·인원·호텔·포함·일정·선택관광)을 보고,
 * 고객용 변경 안내 글을 복사한다.
 */
export function VersionPanel({ versions, currency, customer, onSaveNow }: Props) {
  const n = versions.length;
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const money = (v: number) => formatMoney(Math.round(v), currency);
  const from = versions.find((v) => v.id === fromId) ?? versions[n - 2];
  const to = versions.find((v) => v.id === toId) ?? versions[n - 1];
  const diff = from && to && from !== to ? diffVersions(from, to, money) : null;
  const label = (v: QuoteVersion, i: number) => `v${i + 1} · ${when(v.at)} · ${v.label} · 1인 ${money(v.pricePerPerson)}`;

  return (
    <SectionCard title="견적 버전 비교" description="고객에게 나간 견적의 변경 내역 (문서를 인쇄하면 자동 저장)" icon={GitCompare} collapsible defaultOpen={false} summary={n > 0 ? `${n}개 버전` : "아직 없음"} anchorId="quote-versions">
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onSaveNow} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
            지금 견적을 버전으로 저장
          </button>
          <span className="text-[11px] text-slate-500">견적서·일정표·비교 견적서·영문·상품 소개서를 인쇄하면 자동으로 남습니다 (내용이 같으면 새로 만들지 않음).</span>
        </div>
        {n >= 2 && from && to && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="이전 버전" value={from.id} onChange={(e) => setFromId(e.target.value)} className="max-w-full rounded border border-slate-300 bg-white px-1.5 py-1">
                {versions.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    {label(v, i)}
                  </option>
                ))}
              </select>
              <span aria-hidden>→</span>
              <select aria-label="비교할 버전" value={to.id} onChange={(e) => setToId(e.target.value)} className="max-w-full rounded border border-slate-300 bg-white px-1.5 py-1">
                {versions.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    {label(v, i)}
                  </option>
                ))}
              </select>
            </div>
            {diff && (
              <ul aria-label="바뀐 점" className="space-y-0.5 rounded-md bg-slate-50 p-2.5">
                {diff.lines.length === 0 ? (
                  <li className="text-slate-500">바뀐 점이 없습니다.</li>
                ) : (
                  diff.lines.map((l) => (
                    <li key={l} className={l.startsWith("1인 요금") ? (diff.priceDiff > 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700") : "text-slate-700"}>
                      · {l}
                    </li>
                  ))
                )}
              </ul>
            )}
            <CopyButton label="고객용 변경 안내 복사" variant="secondary" disabled={!diff} getText={() => changeNotice(from, to, money, customer)} />
          </>
        )}
        {n === 1 && <p className="text-slate-500">버전이 하나 있습니다. 견적을 고친 뒤 다시 저장하거나 인쇄하면 비교할 수 있습니다.</p>}
      </div>
    </SectionCard>
  );
}
