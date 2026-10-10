"use client";

import { CalendarDays, Trash2 } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { useHideCosts } from "@/components/SessionContext";
import { formatMoney } from "@/lib/currency";
import { departureNoticeText, departureView, weeklyDates, type DayTourCostInput, type Departure, type DepartureStatus } from "@/lib/dayTour";

interface Props {
  c: DayTourCostInput;
  title: string;
  salePrice: number;
  /** 손익분기 인원 (최소 출발 인원 기본값) */
  breakEven: number | null;
  departures: Departure[];
  minSeats?: number;
  maxSeats?: number;
  onChange: (patch: { departures?: Departure[]; minSeats?: number; maxSeats?: number }) => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TONE: Record<DepartureStatus, string> = {
  "모집 중": "bg-slate-100 text-slate-700",
  "출발 확정": "bg-emerald-100 text-emerald-800",
  마감: "bg-indigo-100 text-indigo-800",
  "취소 안내 필요": "bg-rose-100 text-rose-800",
  "지난 출발": "bg-slate-50 text-slate-400",
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 합류형(정기 출발) — 같은 코스를 정해진 요일마다 여러 팀을 모아 출발시킨다 (마이리얼트립·클룩·KKday의 조인 투어 방식).
 * 날짜마다 판매 좌석을 넣으면 최소 인원 충족(출발 확정)·마감·출발 2일 전 미달(취소 안내)과 그날 이익을 보여 준다.
 */
export function DepartureSection({ c, title, salePrice, breakEven, departures, minSeats, maxSeats, onChange }: Props) {
  const hideCosts = useHideCosts();
  const min = minSeats ?? Math.max(2, breakEven ?? 4);
  const max = maxSeats ?? Math.max(min, c.transport === "vehicle" ? 15 : 12);
  const [from, setFrom] = useState(todayIso());
  const [weeks, setWeeks] = useState(4);
  const [days, setDays] = useState<number[]>([6]);
  const views = departures.map((d) => departureView(c, salePrice, d, min, max));
  const money = (v: number) => formatMoney(Math.round(v), c.currency);
  const setSold = (date: string, sold: number) => onChange({ departures: departures.map((d) => (d.date === date ? { ...d, sold: Math.max(0, Math.min(max, sold)) } : d)) });

  const addDates = () => {
    const have = new Set(departures.map((d) => d.date));
    const add = weeklyDates(from, weeks, days).filter((d) => !have.has(d));
    onChange({ departures: [...departures, ...add.map((date) => ({ date, sold: 0 }))].sort((a, b) => a.date.localeCompare(b.date)), minSeats: min, maxSeats: max });
  };

  return (
    <section aria-label="정기 출발 (합류형)" className="space-y-2 rounded-lg border border-slate-200 p-3">
      <h3 className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
        <CalendarDays className="h-4 w-4 text-indigo-600" aria-hidden />
        정기 출발 (합류형)
        <span className="text-[11px] font-normal text-slate-500">여러 팀을 모아 정해진 날 출발 — 1인 {money(salePrice)}</span>
      </h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
        <label className="inline-flex items-center gap-1">
          최소 출발
          <input type="number" min={1} value={min} onChange={(e) => onChange({ minSeats: Math.max(1, Number(e.target.value) || 1), maxSeats: max })} className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right tabular-nums" />명
        </label>
        <label className="inline-flex items-center gap-1">
          정원
          <input type="number" min={1} value={max} onChange={(e) => onChange({ maxSeats: Math.max(min, Number(e.target.value) || min), minSeats: min })} className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right tabular-nums" />명
        </label>
        {breakEven !== null && <span className="text-slate-500">손익분기 {breakEven}명</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <input type="date" aria-label="첫 출발일" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-200 px-1 py-0.5" />
        <span>부터</span>
        <select aria-label="기간" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="rounded border border-slate-200 bg-white px-1 py-0.5">
          {[1, 2, 4, 8, 12].map((w) => (
            <option key={w} value={w}>
              {w}주
            </option>
          ))}
        </select>
        <span role="group" aria-label="출발 요일" className="inline-flex gap-0.5">
          {WEEKDAYS.map((w, i) => (
            <button
              key={w}
              type="button"
              aria-label={`${w}요일`}
              aria-pressed={days.includes(i)}
              onClick={() => setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))}
              className={`size-6 rounded-full border text-[11px] ${days.includes(i) ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600"}`}
            >
              {w}
            </button>
          ))}
        </span>
        <button type="button" disabled={days.length === 0} onClick={addDates} className="rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          출발일 추가
        </button>
      </div>
      {views.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-1 pr-2 font-medium">출발일</th>
                <th className="py-1 pr-2 font-medium">판매 좌석</th>
                <th className="py-1 pr-2 font-medium">상태</th>
                {!hideCosts && <th className="py-1 pr-2 text-right font-medium">이익</th>}
                <th className="py-1 font-medium">
                  <span className="sr-only">안내·삭제</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {views.map((v) => (
                <tr key={v.date} className={v.status === "지난 출발" ? "opacity-60" : ""}>
                  <td className="py-1 pr-2">
                    {v.date} ({WEEKDAYS[new Date(`${v.date}T00:00:00Z`).getUTCDay()]})
                    {v.daysLeft >= 0 && <span className="ml-1 text-slate-400">D-{v.daysLeft}</span>}
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min={0} max={max} aria-label={`${v.date} 판매 좌석`} value={v.sold} onChange={(e) => setSold(v.date, Number(e.target.value) || 0)} className="w-12 rounded border border-slate-200 px-1 py-0.5 text-right" />
                    <span className="text-slate-400"> / {max}</span>
                  </td>
                  <td className="py-1 pr-2">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${TONE[v.status]}`}>{v.status}</span>
                  </td>
                  {!hideCosts && <td className={`py-1 pr-2 text-right ${v.profit < 0 ? "text-rose-600" : "text-slate-700"}`}>{v.sold > 0 ? money(v.profit) : "—"}</td>}
                  <td className="py-1">
                    <span className="flex items-center justify-end gap-1">
                      {(v.status === "출발 확정" || v.status === "마감") && <CopyButton label="확정 안내" variant="secondary" disabled={false} getText={() => departureNoticeText(title, v, min, true)} />}
                      {v.status === "취소 안내 필요" && v.sold > 0 && <CopyButton label="취소 안내" variant="secondary" disabled={false} getText={() => departureNoticeText(title, v, min, false)} />}
                      <button type="button" aria-label={`${v.date} 출발 지우기`} onClick={() => onChange({ departures: departures.filter((d) => d.date !== v.date) })} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">요일을 고르고 [출발일 추가]를 누르면 출발일마다 좌석·확정 여부를 관리할 수 있습니다.</p>
      )}
      <p className="text-pretty text-[10px] text-slate-400">최소 인원을 채우면 출발 확정, 출발 2일 전까지 못 채우면 취소 안내(전액 환불 또는 날짜 변경)가 업계 관행입니다. [저장]을 눌러야 출발일·좌석이 남습니다.</p>
    </section>
  );
}
