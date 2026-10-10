"use client";

import { Swords } from "lucide-react";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { addPlace, differentiate } from "@/lib/differentiate";
import type { PmChoice } from "@/lib/itinerary";
import { citiesOf, type CityKnowledge } from "@/lib/knowledge";
import type { DayPlan, TripInput } from "@/types";

/** 경쟁 상품 대비 차별화 — 공통 코스·우리만 있는 곳·빠진 인기 장소, 넣는 안과 USP 문구 */
export function DifferentiationPanel({ input, days, pmChoice, onApply }: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice; onApply: (days: DayPlan[]) => void }) {
  const city = citiesOf(input.destination)[0] ?? "";
  const [kb, setKb] = useState<CityKnowledge | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!city) return;
    let alive = true;
    fetch(`/api/knowledge?city=${encodeURIComponent(city)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ doc: CityKnowledge }>) : null))
      .then((j) => alive && setKb(j?.doc ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [city]);
  const d = differentiate(days, pmChoice, input.competitors, kb);
  if (d.rivals === 0 && (kb?.places.length ?? 0) === 0) return null;
  const chip = (name: string, sub: string, tone: string) => (
    <li key={name} className={`rounded-full px-2.5 py-0.5 ring-1 ${tone}`}>
      {name}
      {sub && <span className="ml-1 text-[10px] opacity-70">{sub}</span>}
    </li>
  );
  return (
    <SectionCard title="경쟁 상품 대비 차별화" description="다른 여행사 코스와 견준 공통·우리만·빠진 인기 장소, 넣는 안과 USP" icon={Swords} collapsible defaultOpen={false} summary={`비교 ${d.rivals}개 · 우리만 ${d.oursOnly.length} · 빠진 인기 ${d.missing.length}`} anchorId="differentiation">
      <div className="space-y-3 text-xs">
        {d.rivals === 0 && <p className="text-slate-500">경쟁 상품이 없어 지식 창고만으로 봅니다. 경쟁 상품을 찾으면 여행사별로 견줍니다.</p>}
        <div>
          <p className="font-semibold text-slate-800">우리만 있는 곳 (차별점)</p>
          <ul aria-label="우리만 있는 곳" className="mt-1 flex flex-wrap gap-1.5">
            {d.oursOnly.length ? d.oursOnly.map((p) => chip(p.name, p.score !== null ? `점수 ${p.score}` : "", "bg-emerald-50 text-emerald-800 ring-emerald-200")) : <li className="text-slate-400">없음</li>}
          </ul>
        </div>
        {d.rivals > 0 && (
          <div>
            <p className="font-semibold text-slate-800">공통 코스</p>
            <ul aria-label="공통 코스" className="mt-1 flex flex-wrap gap-1.5">
              {d.common.length ? d.common.map((p) => chip(p.name, `${p.agencies.length}곳`, "bg-slate-50 text-slate-700 ring-slate-200")) : <li className="text-slate-400">없음</li>}
            </ul>
          </div>
        )}
        <div>
          <p className="font-semibold text-slate-800">우리에게 없는 인기 장소</p>
          <ul aria-label="빠진 인기 장소" className="mt-1 space-y-1">
            {d.missing.length === 0 && <li className="text-slate-400">없음</li>}
            {d.missing.map((p) => (
              <li key={p.name} className="flex flex-wrap items-center gap-2">
                <b className="text-slate-800">{p.name}</b>
                <span className="text-[11px] text-slate-500">{p.agencies.length ? `여행사 ${p.agencies.length}곳 포함 (${p.agencies.slice(0, 3).join(", ")})` : "후기 인기"}{p.score !== null ? ` · 점수 ${p.score}` : ""}</span>
                <button
                  type="button"
                  onClick={() => {
                    const r = addPlace(days, pmChoice, p, kb);
                    if (!r) return setMessage(`${p.name}을(를) 넣을 여유 있는 날이 없습니다. 다른 곳을 빼고 넣어 주세요.`);
                    onApply(r.days);
                    setMessage(`${p.name}을(를) DAY ${r.day}에 넣었습니다. 순서는 [재정렬]로 맞추세요.`);
                  }}
                  className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  넣기
                </button>
              </li>
            ))}
          </ul>
        </div>
        {d.usp.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-indigo-50/60 p-2.5">
            <ul aria-label="USP 문구" className="min-w-0 flex-1 list-disc space-y-0.5 pl-4 text-indigo-900">
              {d.usp.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
            <CopyButton label="USP 문구 복사" variant="secondary" disabled={false} getText={() => d.usp.join("\n")} />
          </div>
        )}
        {message && (
          <p role="status" className="text-emerald-700">
            {message}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
