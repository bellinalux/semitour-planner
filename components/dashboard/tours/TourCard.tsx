"use client";

import { BadgeCheck, CalendarPlus, Check, Clock, ExternalLink, Info, ListPlus, Ticket } from "lucide-react";
import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import { formatDuration } from "@/lib/format";
import { TOUR_CATEGORY_MAP } from "@/lib/itemTypes";
import { slotOptions } from "@/lib/tourItem";
import type { CurrencyCode, DayPlan, TourCandidate, TourSlot } from "@/types";

interface Props {
  tour: TourCandidate;
  currency: CurrencyCode;
  days: DayPlan[];
  /** 지금 이 투어를 넣은 위치들 (같은 투어를 여러 날에 넣을 수 있다) */
  addedTo: string[];
  /** 선택 옵션으로 추가한 횟수 */
  optionCount: number;
  onAdd: (dayNo: number, slot: TourSlot) => void;
  onAddOption: (dayNo: number) => void;
}

const selectClass =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

export function TourCard({ tour, currency, days, addedTo, optionCount, onAdd, onAddOption }: Props) {
  const category = TOUR_CATEGORY_MAP[tour.category];
  const [dayNo, setDayNo] = useState<number>(days.find((d) => d.kind === "semi")?.day ?? days[0]?.day ?? 1);
  const day = days.find((d) => d.day === dayNo) ?? days[0];
  const slots = day ? slotOptions(day) : [];
  const [slot, setSlot] = useState<TourSlot>(slots[0]?.slot ?? "day");
  // 날짜를 바꾸면 그 날짜에서 쓸 수 없는 위치가 선택돼 있을 수 있으므로 보정한다
  const activeSlot = slots.some((s) => s.slot === slot) ? slot : (slots[0]?.slot ?? "day");

  const price =
    tour.priceLow === tour.priceHigh
      ? formatMoney(tour.priceLow, currency)
      : `${formatMoney(tour.priceLow, currency)} ~ ${formatMoney(tour.priceHigh, currency)}`;

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
          {category.emoji} {category.label}
        </span>
        {tour.koreanGuide && (
          <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
            <BadgeCheck className="h-3 w-3" aria-hidden />
            한국어 확인
          </span>
        )}
      </div>
      <h4 className="mt-1.5 text-sm font-semibold leading-5 text-slate-900">{tour.name}</h4>
      {tour.description && <p className="mt-1 text-xs leading-5 text-slate-600">{tour.description}</p>}

      <div className="mt-2 space-y-1 text-[11px] leading-4 text-slate-600">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {tour.durationMinutes > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              {formatDuration(tour.durationMinutes)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            <span className="font-semibold tabular-nums text-slate-900">1인 {price}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                tour.priceBasis === "searched" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
              title={tour.priceBasis === "searched" ? "웹 검색에서 확인한 요금 (날짜·인원에 따라 달라짐)" : "AI 추정"}
            >
              {tour.priceBasis === "searched" ? "검색 확인" : "추정"}
            </span>
          </span>
        </p>
        {tour.includes && (
          <p>
            <span className="font-medium text-slate-700">포함</span> {tour.includes}
          </p>
        )}
        {tour.booking && (
          <p className="flex items-start gap-1.5">
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span>{tour.booking}</span>
          </p>
        )}
        {tour.koreanGuide && <p className="text-sky-700">{tour.koreanNote}</p>}
        {tour.highlights && <p className="text-slate-500">{tour.highlights}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
        <select
          aria-label={`${tour.name} 넣을 날짜`}
          value={day?.day}
          onChange={(e) => setDayNo(Number(e.target.value))}
          className={selectClass}
        >
          {days.map((d) => (
            <option key={d.day} value={d.day}>
              DAY {d.day} · {d.theme.slice(0, 14)}
            </option>
          ))}
        </select>
        <select
          aria-label={`${tour.name} 넣을 위치`}
          value={activeSlot}
          onChange={(e) => setSlot(e.target.value as TourSlot)}
          className={selectClass}
        >
          {slots.map((s) => (
            <option key={s.slot} value={s.slot}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => day && onAdd(day.day, activeSlot)}
          disabled={!day}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
          일정에 넣기
        </button>
        <button
          type="button"
          onClick={() => day && onAddOption(day.day)}
          disabled={!day}
          title="기본 요금에 넣지 않고, 고객이 고르는 선택 옵션으로 등록합니다"
          className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ListPlus className="h-3.5 w-3.5" aria-hidden />
          선택 옵션으로 추가
        </button>
        <a
          href={tour.searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
        >
          예약처 검색
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>

      {optionCount > 0 && (
        <p role="status" className="mt-2 flex items-start gap-1 text-[11px] font-medium text-indigo-700">
          <Check className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>선택 옵션에 추가했습니다{optionCount > 1 ? ` (${optionCount}회)` : ""}. 아래 &quot;선택 옵션&quot;에서 요금과 최소 인원을 조정하세요.</span>
        </p>
      )}
      {addedTo.length > 0 && (
        <p role="status" className="mt-2 flex items-start gap-1 text-[11px] font-medium text-emerald-700">
          <Check className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>일정에 넣었습니다: {addedTo.join(", ")}</span>
        </p>
      )}
    </li>
  );
}
