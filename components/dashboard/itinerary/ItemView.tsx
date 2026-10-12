"use client";

import { useSyncExternalStore } from "react";

/**
 * 일정 항목 보기 — 간단히(한 줄: 시각·이름·체류·금액, 누르면 펼침) / 자세히(입력칸 모두 펼침).
 * 이 브라우저에 기억한다. 편집 중에는 늘 자세히.
 */
export type ItemView = "compact" | "detail";

const KEY = "semitour-planner:itemView";
const EVENT = "semitour:item-view";

export function readItemView(): ItemView {
  try {
    return localStorage.getItem(KEY) === "detail" ? "detail" : "compact";
  } catch {
    return "compact";
  }
}

function writeItemView(view: ItemView) {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    /* 무시 */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useItemView(): ItemView {
  return useSyncExternalStore(subscribe, readItemView, () => "compact");
}

/** 일정표 머리의 [간단히 | 자세히] 고르기 */
export function ItemViewSwitch() {
  const view = useItemView();
  const options: { id: ItemView; label: string; title: string }[] = [
    { id: "compact", label: "간단히", title: "항목을 한 줄로 — 누르면 그 항목만 펼칩니다" },
    { id: "detail", label: "자세히", title: "체류·금액·판매가 포함 등 입력칸을 모두 펼칩니다" },
  ];
  return (
    <div role="radiogroup" aria-label="항목 보기" className="inline-flex shrink-0 rounded-md border border-slate-300 bg-white p-0.5 text-xs font-medium">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={view === o.id}
          title={o.title}
          onClick={() => writeItemView(o.id)}
          className={`rounded px-2 py-1 ${view === o.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
