"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { ITEM_TYPE_META } from "@/lib/itemTypes";
import type { ItemType, ItineraryItem } from "@/types";

const TYPES: ItemType[] = ["sightseeing", "meal", "experience", "shopping", "free_time", "transfer"];
const STAY: Partial<Record<ItemType, number>> = { meal: 60, free_time: 60, transfer: 0, shopping: 40 };

/**
 * 항목 사이에 끼워 넣기 — 줄 사이의 [+]를 누르면 이름·유형을 넣고 그 자리에 바로 들어간다.
 * 체류는 유형별 기본값(관광 60분), 다음 장소까지 이동은 20분으로 시작한다 (넣은 뒤 고친다).
 */
export function InsertSlot({ dayNo, after, onInsert }: { dayNo: number; after: string; onInsert: (item: ItineraryItem) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ItemType>("sightseeing");

  if (!open) {
    return (
      <div className="group -my-1 flex h-4 items-center pl-10">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${after} 다음에 항목 넣기`}
          title="이 자리에 항목 넣기"
          className="inline-flex items-center gap-0.5 rounded-full px-1.5 text-[10.5px] font-medium text-slate-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:bg-indigo-50 focus-visible:text-indigo-700 group-hover:text-slate-500"
        >
          <Plus className="size-3" aria-hidden />
          넣기
        </button>
      </div>
    );
  }

  const add = () => {
    const n = name.trim();
    if (!n) return;
    onInsert({
      id: `new-${crypto.randomUUID().slice(0, 8)}`,
      type,
      admission: type === "sightseeing" || type === "experience" ? "unknown" : "none",
      name: n,
      description: "",
      stayMinutes: STAY[type] ?? 60,
      travelMinutesToNext: 20,
      entryFee: 0,
      mealCost: 0,
      isEstimated: false,
    });
    setName("");
    setOpen(false);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
      aria-label={`DAY ${dayNo} 항목 넣기`}
      className="my-1.5 ml-10 flex flex-wrap items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50/50 px-2 py-1.5 text-xs"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="장소·일정 이름"
        aria-label="넣을 항목 이름"
        className="min-w-0 flex-1 basis-40 rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
      />
      <select value={type} onChange={(e) => setType(e.target.value as ItemType)} aria-label="넣을 항목 유형" className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs">
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {ITEM_TYPE_META[t].emoji} {ITEM_TYPE_META[t].label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!name.trim()} className="rounded bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
        넣기
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-slate-500 hover:bg-white">
        취소
      </button>
    </form>
  );
}
