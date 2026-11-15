"use client";

/** "○○ 꼭 가볼 곳" — 어느 여행 방식이든: 한국인 인기 먼저, 왜 가는지·팁·머무는 시간, 가는 방법(도심·공항에서) + 길찾기, [코스에 넣기] */
import { useEffect, useState } from "react";
import type { MustSpot, MustSpots } from "@/lib/publicPlan";
import { accessHint } from "@/lib/selfGuide";

export function MustSee({ city, guided, isIn, onAdd }: { city: string; guided: boolean; isIn: (name: string) => boolean; onAdd: (spot: MustSpot) => void }) {
  const [data, setData] = useState<MustSpots | null>(null);
  const [open, setOpen] = useState<string>("");

  useEffect(() => {
    const c = city.trim();
    if (!c) return;
    let live = true;
    const t = window.setTimeout(() => {
      fetch(`/api/public-plan/spots?dest=${encodeURIComponent(c)}`)
        .then((r) => r.json() as Promise<MustSpots>)
        .then((d) => live && setData(d))
        .catch(() => undefined);
    }, 500);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [city]);

  if (!data || data.spots.length === 0 || data.city !== city.split(/[,/]/)[0].trim()) return null;
  return (
    <section aria-label="꼭 가볼 곳" className="space-y-2 rounded-xl border border-slate-200 p-3">
      <header className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-bold text-slate-900">{data.city} 꼭 가볼 곳</h2>
        <span className="text-[11px] text-slate-500">{data.source === "knowledge" ? "한국 여행사 일정·후기·우리 고객이 좋아한 순" : "공개 자료 기준 대표 명소"}</span>
      </header>
      <ol className="space-y-1.5">
        {data.spots.map((s, k) => {
          const how = accessHint(data.center, s, data.city, guided);
          const added = isIn(s.name);
          return (
            <li key={s.name} className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-5 shrink-0 text-center font-bold text-slate-400">{k + 1}</span>
                <b className="text-slate-900">{s.name}</b>
                {s.korean && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-rose-700">🇰🇷 한국인 인기</span>}
                {s.area && <span className="text-[11px] text-slate-500">{s.area}</span>}
                <span className="text-[11px] text-slate-500">· 약 {s.stayMin}분</span>
                <span className="ml-auto flex items-center gap-2">
                  <button type="button" aria-expanded={open === s.name} onClick={() => setOpen(open === s.name ? "" : s.name)} className="text-[11px] font-semibold text-sky-700 underline underline-offset-2">
                    가는 방법
                  </button>
                  {added ? (
                    <span className="text-[11px] font-semibold text-emerald-700">✓ 코스에 있음</span>
                  ) : (
                    <button type="button" aria-label={`${s.name} 코스에 넣기`} onClick={() => onAdd(s)} className="rounded-md border border-indigo-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      + 코스에 넣기
                    </button>
                  )}
                </span>
              </div>
              <p className="pl-6 text-[11px] text-slate-600">{s.why}</p>
              {s.tips.length > 0 && <p className="pl-6 text-[11px] text-amber-800">💡 {s.tips.join(" · ")}</p>}
              {open === s.name && (
                <p className="pl-6 pt-0.5 text-[11px] text-sky-800">
                  🚉 {how.text}{" "}
                  <a href={how.link} target="_blank" rel="noopener noreferrer" className="underline">
                    도심에서 길찾기
                  </a>{" "}
                  ·{" "}
                  <a href={how.airportLink} target="_blank" rel="noopener noreferrer" className="underline">
                    공항에서 길찾기
                  </a>
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
