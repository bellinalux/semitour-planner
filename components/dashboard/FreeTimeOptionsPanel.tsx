"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatDuration } from "@/lib/format";
import { freeSlots, optionFromCard, slotCandidates } from "@/lib/freeSlots";
import type { PmChoice } from "@/lib/itinerary";
import { citiesOf, type CityKnowledge } from "@/lib/knowledge";
import type { DayPlan, TourOption, TripInput } from "@/types";

/** 자유시간 선택관광 — 쉬는 시간(전일·오후·오전 자유, 일찍 끝나는 날)마다 넣을 선택관광 후보와 날짜 없는 선택관광 배치 */
export function FreeTimeOptionsPanel({ input, days, pmChoice, onOptions }: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice; onOptions: (options: TourOption[]) => void }) {
  const city = citiesOf(input.destination)[0] ?? "";
  const [doc, setDoc] = useState<CityKnowledge | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!city) return;
    let alive = true;
    fetch(`/api/knowledge?city=${encodeURIComponent(city)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ doc: CityKnowledge }>) : null))
      .then((j) => alive && setDoc(j?.doc ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [city]);
  const slots = freeSlots(days, pmChoice);
  if (slots.length === 0) return null;
  const cands = slotCandidates(doc, days, input.options, input.companions, 4);
  const unassigned = input.options.filter((o) => !o.dayNo);
  const inSlot = (d: number) => input.options.filter((o) => o.dayNo === d);
  return (
    <SectionCard title="자유시간 선택관광" description="쉬는 시간마다 넣을 선택관광 후보 (지식 창고 인기·동반자 기준)" icon={Sparkles} collapsible defaultOpen={false} summary={`자유시간 ${slots.length}곳`} anchorId="free-options">
      <ul aria-label="자유시간" className="space-y-2.5 text-xs">
        {slots.map((s) => (
          <li key={s.day} className="space-y-1 rounded-md border border-slate-200 p-2.5">
            <p>
              <b className="text-slate-900">DAY {s.day}</b> {s.kind} <span className="text-slate-500">약 {formatDuration(s.minutes)}</span>
              {inSlot(s.day).length > 0 && <span className="ml-1 text-emerald-700">· 선택관광 {inSlot(s.day).map((o) => o.name).join(", ")}</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {cands.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  title={[p.likes[0], p.fits.length ? `잘 맞음: ${p.fits.join(",")}` : ""].filter(Boolean).join(" · ")}
                  onClick={() => {
                    onOptions([...input.options, optionFromCard(p, s.day)]);
                    setMessage(`DAY ${s.day} 선택관광에 ${p.name}을(를) 넣었습니다. 요금은 선택관광 칸에서 넣어 주세요.`);
                  }}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-indigo-800 hover:bg-indigo-100"
                >
                  + {p.name}
                </button>
              ))}
              {unassigned.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    onOptions(input.options.map((x) => (x.id === o.id ? { ...x, dayNo: s.day } : x)));
                    setMessage(`${o.name}을(를) DAY ${s.day}로 정했습니다.`);
                  }}
                  className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50"
                >
                  {o.name} → 이 날
                </button>
              ))}
              {cands.length === 0 && unassigned.length === 0 && <span className="text-slate-400">지식 창고에 후보가 없습니다 — 투어 카탈로그에서 검색해 넣으세요.</span>}
            </div>
          </li>
        ))}
      </ul>
      {message && (
        <p role="status" className="mt-2 text-xs text-emerald-700">
          {message}
        </p>
      )}
    </SectionCard>
  );
}
