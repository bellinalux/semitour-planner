"use client";

import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { ITEM_TYPE_META } from "@/lib/itemTypes";
import { matchPlaces, SOURCE_LABEL, type PlaceSuggestion } from "@/lib/placeSuggest";
import type { ItemType, ItineraryItem } from "@/types";
import { usePlaceSuggestions } from "./PlaceSuggest";

const TYPES: ItemType[] = ["sightseeing", "meal", "experience", "shopping", "free_time", "transfer"];
const STAY: Partial<Record<ItemType, number>> = { meal: 60, free_time: 60, transfer: 0, shopping: 40 };

const SOURCE_TONE: Record<PlaceSuggestion["source"], string> = {
  fav: "bg-amber-50 text-amber-800 ring-amber-200",
  know: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  trip: "bg-slate-100 text-slate-600 ring-slate-200",
};

const newId = () => `new-${crypto.randomUUID().slice(0, 8)}`;

/**
 * 항목 사이에 끼워 넣기 — 줄 사이의 [+]를 누르고 이름을 치면 장소 후보(즐겨찾기·지식 창고·이 일정)가 뜬다.
 * 후보를 고르면 유형·체류(즐겨찾기·이 일정은 금액·설명·좌표까지)가 함께 들어가고, 없으면 쓴 이름 그대로 넣는다.
 * 직접 넣으면 체류는 유형별 기본값(관광 60분), 다음 장소까지 이동은 20분으로 시작한다 (넣은 뒤 고친다).
 */
export function InsertSlot({ dayNo, after, city, onInsert }: { dayNo: number; after: string; city?: string; onInsert: (item: ItineraryItem) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ItemType>("sightseeing");
  const [picked, setPicked] = useState<PlaceSuggestion | null>(null);
  const [active, setActive] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const listId = useId();
  const all = usePlaceSuggestions(city, open);
  const hits = picked ? [] : matchPlaces(name, all);
  const showList = listOpen && hits.length > 0;

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

  const close = () => {
    setOpen(false);
    setName("");
    setPicked(null);
    setListOpen(false);
  };
  const choose = (s: PlaceSuggestion) => {
    setPicked(s);
    setName(s.name);
    setType(s.item.type ?? "sightseeing");
    setListOpen(false);
  };
  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (picked && picked.name === n) {
      onInsert({ ...picked.item, id: newId() });
    } else {
      onInsert({
        id: newId(),
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
    }
    close();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
      aria-label={`DAY ${dayNo} 항목 넣기`}
      className="relative my-1.5 ml-10 flex flex-wrap items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50/50 px-2 py-1.5 text-xs"
    >
      <div className="relative min-w-0 flex-1 basis-48">
        <input
          autoFocus
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setPicked(null);
            setActive(0);
            setListOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (showList) setListOpen(false);
              else close();
            } else if (showList && e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (showList && e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (showList && e.key === "Enter") {
              e.preventDefault();
              choose(hits[active]);
            }
          }}
          onBlur={() => setListOpen(false)}
          placeholder="장소 이름 — 즐겨찾기·지식 창고에서 찾기"
          aria-label="넣을 항목 이름"
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
        />
        {showList && (
          <ul id={listId} role="listbox" aria-label="장소 후보" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
            {hits.map((s, i) => (
              <li
                key={s.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // 입력칸 blur보다 먼저 고르게 (mousedown)
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${i === active ? "bg-indigo-50" : ""}`}
              >
                <span className="shrink-0" aria-hidden>
                  {ITEM_TYPE_META[s.item.type ?? "sightseeing"].emoji}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{s.name}</span>
                {s.sub && <span className="shrink-0 text-[10.5px] text-slate-500">{s.sub}</span>}
                <span className={`shrink-0 rounded px-1 text-[10px] font-semibold ring-1 ${SOURCE_TONE[s.source]}`}>{SOURCE_LABEL[s.source]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <select value={type} onChange={(e) => setType(e.target.value as ItemType)} disabled={picked !== null} aria-label="넣을 항목 유형" className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs disabled:opacity-60">
        {[...new Set([...TYPES, type])].map((t) => (
          <option key={t} value={t}>
            {ITEM_TYPE_META[t].emoji} {ITEM_TYPE_META[t].label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!name.trim()} className="rounded bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
        넣기
      </button>
      <button type="button" onClick={close} className="rounded px-2 py-1 text-slate-500 hover:bg-white">
        취소
      </button>
      {picked && (
        <p className="basis-full text-[11px] text-slate-500">
          <b className="text-slate-700">{SOURCE_LABEL[picked.source]}</b>에서 고름 — {picked.item.stayMinutes > 0 ? `체류 ${picked.item.stayMinutes}분` : "체류 없음"}
          {picked.item.entryFee + picked.item.mealCost > 0 ? ` · 금액 ${(picked.item.entryFee + picked.item.mealCost).toLocaleString("ko-KR")}` : ""}
          {picked.source === "know" ? " (금액은 웹 확인으로 채우세요)" : ""}
        </p>
      )}
    </form>
  );
}
