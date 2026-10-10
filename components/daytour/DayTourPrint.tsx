"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { fmt } from "@/lib/courseEngine/time";
import { dayTourTimeline, legModeText, type DayTourCost, type DayTourCostInput } from "@/lib/dayTour";

/**
 * 근교 투어 운영표 인쇄 — 화면에 보이지 않는 인쇄 영역을 문서 맨 아래에 그려 브라우저 인쇄(PDF 저장)로 넘긴다.
 * 가이드·기사용이라 시각표·이동·현장 메모만 넣고 원가·판매가는 넣지 않는다.
 */
export function DayTourPrint({ c, title, cost, company, onDone }: { c: DayTourCostInput; title: string; cost: DayTourCost; company: string; onDone: () => void }) {
  useEffect(() => {
    const done = () => onDone();
    window.addEventListener("afterprint", done);
    const timer = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [onDone]);

  const tl = dayTourTimeline(c.baseName, c.stops, c.legs, c.start);
  return createPortal(
    <div className="print-root" aria-hidden>
      <article className="mx-auto max-w-[190mm] bg-white p-8 text-[11px] leading-5 text-slate-900 print:p-0">
        <header className="flex items-end justify-between border-b-2 border-emerald-600 pb-2">
          <div>
            <h1 className="text-lg font-bold text-emerald-900">근교 투어 운영표</h1>
            <p className="text-xs text-slate-600">{title} — 가이드·기사용 · 가격 정보 없음</p>
          </div>
          {company && <p className="text-sm font-semibold text-emerald-800">{company}</p>}
        </header>
        <p className="mt-3">
          {c.length === "full" ? "당일" : "반일"} · {c.travelers}명 · {cost.vehicle ? `${cost.vehicle.label}${cost.vehicle.count > 1 ? ` ${cost.vehicle.count}대` : ""}` : "차량 없음"} · 가이드 {cost.guides}명 · {fmt(tl.startMin)} {c.baseName} 출발
        </p>
        <table className="mt-2 w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="border-b border-emerald-200 bg-emerald-50 text-left">
              <th className="w-24 px-1.5 py-1">시각</th>
              <th className="px-1.5 py-1">일정</th>
              <th className="px-1.5 py-1">현장 메모</th>
            </tr>
          </thead>
          <tbody>
            {tl.rows.map((r) => {
              if (r.kind === "stop") {
                const s = c.stops[r.index];
                return (
                  <tr key={`s${r.index}`} className="border-b border-slate-100 align-top">
                    <td className="px-1.5 py-1 tabular-nums">
                      {fmt(r.start)}–{fmt(r.end)}
                    </td>
                    <td className="px-1.5 py-1 font-medium">{s.name}</td>
                    <td className="px-1.5 py-1 text-slate-700">
                      {[s.kind === "meal" ? `${c.travelers}명 식사 예약 확인` : s.entryFee > 0 ? `입장권 ${c.travelers}매` : "", s.note].filter(Boolean).join(" · ")}
                    </td>
                  </tr>
                );
              }
              const l = c.legs[r.index];
              return (
                <tr key={`l${r.index}`} className="border-b border-slate-100 align-top text-slate-600">
                  <td className="px-1.5 py-1 tabular-nums">{fmt(r.start)}</td>
                  <td className="px-1.5 py-1">
                    └ {legModeText(l.mode)} {l.km}km · {l.minutes}분
                  </td>
                  <td className="px-1.5 py-1">{[l.route, l.mode === "transit" ? "교통카드·인원 확인" : ""].filter(Boolean).join(" · ")}</td>
                </tr>
              );
            })}
            <tr>
              <td className="px-1.5 py-1 tabular-nums font-semibold">{fmt(tl.endMin)}</td>
              <td className="px-1.5 py-1 font-semibold" colSpan={2}>
                {c.baseName} 도착 (해산)
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-[10px] text-slate-500">시각은 이동·체류 시간으로 계산한 예정 시각입니다. 차량 4시간 연속 운전 시 30분 이상 휴게하세요.</p>
      </article>
    </div>,
    document.body,
  );
}
