"use client";

import { createContext, useContext, useState } from "react";
import type { ItemPatch } from "./TimelineItemParts";

/** 일정 편집 중 여러 항목 고르기 — 고른 항목을 한 번에 바꾼다 (판매가 포함·현지 지불·체류 시간) */
interface SelectionView {
  selected: Set<string>;
  toggle: (id: string) => void;
  clear: () => void;
}

export const SelectionContext = createContext<SelectionView | null>(null);

export function useSelectionState(): SelectionView {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return {
    selected,
    toggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    clear: () => setSelected(new Set()),
  };
}

/** 항목 앞 고르기 칸 (편집 중에만) */
export function SelectBox({ id, name }: { id: string; name: string }) {
  const sel = useContext(SelectionContext);
  if (!sel) return null;
  return <input type="checkbox" checked={sel.selected.has(id)} onChange={() => sel.toggle(id)} aria-label={`${name} 고르기`} className="size-4 shrink-0 accent-indigo-600" />;
}

/** 고른 항목 한꺼번에 바꾸기 — 일정표 아래에 붙어 따라온다 */
export function BulkBar({ onChangeItem }: { onChangeItem: (itemId: string, patch: ItemPatch) => void }) {
  const sel = useContext(SelectionContext);
  const [stay, setStay] = useState("");
  if (!sel || sel.selected.size === 0) return null;
  const ids = [...sel.selected];
  const apply = (patch: ItemPatch) => ids.forEach((id) => onChangeItem(id, patch));
  const minutes = Math.round(Number(stay));
  return (
    <div role="region" aria-label="고른 항목 한꺼번에 바꾸기" className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-indigo-200 bg-indigo-50 px-4 py-2 text-xs">
      <b className="text-indigo-900">{ids.length}개 고름</b>
      <button type="button" onClick={() => apply({ payment: "included" })} className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50">
        판매가 포함
      </button>
      <button type="button" onClick={() => apply({ payment: "local" })} className="rounded-md border border-orange-300 bg-white px-2 py-1 font-medium text-orange-700 hover:bg-orange-50">
        현지 지불(불포함)
      </button>
      <span className="inline-flex items-center gap-1">
        체류
        <input
          type="number"
          min={0}
          step={10}
          value={stay}
          onChange={(e) => setStay(e.target.value)}
          aria-label="고른 항목 체류 시간(분)"
          className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-right tabular-nums"
        />
        분
        <button
          type="button"
          disabled={stay === "" || !(minutes >= 0)}
          onClick={() => {
            apply({ stayMinutes: minutes });
            setStay("");
          }}
          className="rounded-md bg-indigo-600 px-2 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          적용
        </button>
      </span>
      <button type="button" onClick={sel.clear} className="ml-auto rounded-md px-2 py-1 text-slate-600 hover:bg-white">
        고르기 풀기
      </button>
    </div>
  );
}
