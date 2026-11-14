"use client";

import { AlertTriangle, FileSignature } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { contractTermRisks, contractTerms, entryNotes, REGION_LABEL, termChoices, termRegions } from "@/lib/specialTerms";
import type { CompanyProfile, TripInput } from "@/types";
import { fastPaste } from "@/lib/fastPaste";

/**
 * 이 상품의 여행계약서 특약 — 여행지에 맞춰 추천한 특약을 켜고 끄고, 이 상품만의 특약을 더한다.
 * 무효가 될 수 있는 문구는 바로 알리고, 인쇄 전에도 한 번 더 확인한다.
 */
export function SpecialTermsPanel({ input, onChange, company }: { input: TripInput; onChange: (patch: Partial<TripInput>) => void; company: CompanyProfile }) {
  const settings = company.specialTerms;
  const choices = termChoices(input, settings);
  const regions = termRegions(input.destination);
  const risks = contractTermRisks(contractTerms(input, settings), settings);
  const entries = entryNotes(input.destination);
  const toggle = (id: string, on: boolean, recommended: boolean) => {
    const next = { ...input.specialTermOverrides };
    if (on === recommended) delete next[id];
    else next[id] = on;
    onChange({ specialTermOverrides: next });
  };
  const onCount = choices.filter((c) => c.on).length;

  return (
    <section aria-label="계약서 특약" className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <FileSignature className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          여행계약서 특약 ({onCount}개)
        </span>
        <span className="text-[11px] text-slate-500">{regions.length ? `여행지: ${regions.map((r) => REGION_LABEL[r]).join(", ")}` : "공통 특약만"}</span>
      </div>
      <p className="text-[11px] leading-4 text-slate-500">
        표준약관 제6조 특약입니다. 계약서에 &quot;표준약관과 다른 점&quot;과 별도 동의란이 함께 들어갑니다. 금액·영업시간·회사 고유 특약은 더보기 → 회사 설정에서 정합니다.
      </p>
      <ul className="space-y-1">
        {choices.map(({ term, on, recommended }) => (
          <li key={term.id}>
            <label className="flex items-start gap-1.5 text-[11px] text-slate-700">
              <input type="checkbox" checked={on} onChange={(e) => toggle(term.id, e.target.checked, recommended)} className="mt-0.5" />
              <span>
                {term.title}
                {term.region && <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] text-sky-700">{REGION_LABEL[term.region]}</span>}
                {recommended && <span className="ml-1 text-[10px] text-slate-400">추천</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label className="block text-[11px] font-medium text-slate-600">
        이 상품만의 특약 (한 줄에 하나)
        <textarea
          rows={2}
          value={input.customSpecialTerms}
          onChange={(e) => onChange({ customSpecialTerms: e.target.value })}
          onPaste={fastPaste((customSpecialTerms) => onChange({ customSpecialTerms }))}
          placeholder="예) 크루즈 일정은 선사 규정에 따라 출발 60일 전부터 취소료가 발생합니다."
          className={`${inputClass} mt-1 resize-y`}
        />
      </label>
      {risks.map((r) => (
        <p key={r} role="alert" className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {r}
        </p>
      ))}
      {entries.length > 0 && (
        <div className="rounded-md bg-white px-2.5 py-2 text-[11px] leading-4 text-slate-600">
          <p className="font-medium text-slate-700">입국 요건 (계약서·일정표 유의사항에 들어감)</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            {entries.map((e) => (
              <li key={e.region}>
                {REGION_LABEL[e.region]}: {e.text} <span className="text-slate-400">({e.checked} 확인)</span>
              </li>
            ))}
          </ul>
          <p className="mt-0.5 text-slate-400">요건은 자주 바뀝니다. 출발 전 외교부 해외안전여행(0404.go.kr)에서 다시 확인하세요.</p>
        </div>
      )}
    </section>
  );
}
