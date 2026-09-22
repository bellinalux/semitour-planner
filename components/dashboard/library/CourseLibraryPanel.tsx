"use client";

import { BookMarked, CalendarPlus, Check, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { SEGMENT_KIND_LABELS, type CourseSegment } from "@/lib/segmentLibrary";
import { slotOptions } from "@/lib/tourItem";
import type { DayPlan, ItineraryItem, TourSlot } from "@/types";

interface Props {
  destination: string;
  days: DayPlan[];
  segments: CourseSegment[];
  onInsert: (dayNo: number, slot: TourSlot, items: ItineraryItem[]) => void;
  onAppendDay: (items: ItineraryItem[], theme: string) => void;
  onDelete: (id: string) => void;
}

const selectClass =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

function SegmentCard({ segment, days, onInsert, onAppendDay, onDelete }: Omit<Props, "destination" | "segments"> & { segment: CourseSegment }) {
  const [dayNo, setDayNo] = useState<number>(days.find((d) => d.kind === "semi")?.day ?? days[0]?.day ?? 1);
  const day = days.find((d) => d.day === dayNo) ?? days[0];
  const slots = day ? slotOptions(day) : [];
  const [slot, setSlot] = useState<TourSlot>(slots[0]?.slot ?? "day");
  const activeSlot = slots.some((s) => s.slot === slot) ? slot : (slots[0]?.slot ?? "day");
  const [added, setAdded] = useState(false);

  const insert = () => {
    if (segment.kind === "day") {
      onAppendDay(segment.items, segment.name);
    } else if (day) {
      onInsert(day.day, activeSlot, segment.items);
    }
    setAdded(true);
  };

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{SEGMENT_KIND_LABELS[segment.kind]}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{segment.destination}</span>
        <span className="text-[10px] text-slate-400">{segment.items.length}곳</span>
      </div>
      <h4 className="mt-1.5 text-sm font-semibold leading-5 text-slate-900">{segment.name}</h4>
      <p className="mt-1 text-xs leading-5 text-slate-600">{segment.items.map((i) => i.name).join(" · ")}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
        {segment.kind === "day" ? (
          <button
            type="button"
            onClick={insert}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
            새 날짜로 추가
          </button>
        ) : (
          <>
            <select aria-label={`${segment.name} 넣을 날짜`} value={day?.day} onChange={(e) => setDayNo(Number(e.target.value))} className={selectClass}>
              {days.map((d) => (
                <option key={d.day} value={d.day}>
                  DAY {d.day} · {d.theme.slice(0, 14)}
                </option>
              ))}
            </select>
            <select aria-label={`${segment.name} 넣을 위치`} value={activeSlot} onChange={(e) => setSlot(e.target.value as TourSlot)} className={selectClass}>
              {slots.map((s) => (
                <option key={s.slot} value={s.slot}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={insert}
              disabled={!day}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
              일정에 넣기
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onDelete(segment.id)}
          aria-label={`${segment.name} 라이브러리에서 삭제`}
          className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {added && (
        <p role="status" className="mt-2 flex items-start gap-1 text-[11px] font-medium text-emerald-700">
          <Check className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          일정에 넣었습니다.
        </p>
      )}
    </li>
  );
}

/** 즐겨찾기로 저장해 둔 코스 조각(오전/오후/하루/장소)을 찾아 지금 일정에 바로 넣는다. */
export function CourseLibraryPanel({ destination, days, segments, onInsert, onAppendDay, onDelete }: Props) {
  const [query, setQuery] = useState(destination);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return segments;
    return segments.filter((s) => s.destination.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [segments, query]);

  return (
    <SectionCard title="코스 라이브러리" description="즐겨찾기해 둔 코스·장소를 찾아 지금 일정에 바로 넣습니다" icon={BookMarked}>
      <div className="space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="목적지·이름으로 찾기 (비우면 전체)"
          aria-label="코스 라이브러리 검색"
          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
        {segments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-xs text-slate-500">
            아직 저장한 코스가 없습니다. 일정표에서 오전·오후·하루 일정 옆 &quot;즐겨찾기&quot; 버튼이나, 항목의 별표 버튼으로 저장하세요.
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-xs text-slate-500">
            &quot;{query}&quot;와(과) 맞는 코스가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((s) => (
              <SegmentCard key={s.id} segment={s} days={days} onInsert={onInsert} onAppendDay={onAppendDay} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
