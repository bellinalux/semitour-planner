"use client";

import { CalendarRange, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** 박수 바꾸기 — 지금 상품을 하루 줄이거나 늘려 다시 짠다 (줄이면 장소를 다른 날로, 늘리면 새 날을 만들어 넣음) */
export function NightsButton({ nights, days, onChange }: { nights: number; days: number; onChange: (delta: number) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  const choices = [-2, -1, 1, 2].filter((d) => days + d >= 2 && nights + d >= 1 && days + d <= 14);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarRange className="h-4 w-4" aria-hidden />}
        {busy ? "다시 짜는 중…" : `박수 바꾸기 (${nights}박 ${days}일)`}
      </button>
      {open && (
        <div role="menu" aria-label="박수 바꾸기" className="absolute right-0 top-full z-30 mt-1 w-64 space-y-1 rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-lg">
          <p className="px-1 text-[11px] text-slate-500">줄이면 가장 가벼운 날을 빼고 그 장소는 다른 날로, 늘리면 지금 없는 인기 장소로 새 날을 만들어 마지막 날 앞에 넣습니다.</p>
          {choices.map((d) => (
            <button
              key={d}
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                setBusy(true);
                setMessage("");
                try {
                  setMessage(await onChange(d));
                } finally {
                  setBusy(false);
                }
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left font-medium text-slate-800 hover:bg-slate-50"
            >
              {nights + d}박 {days + d}일로 ({d > 0 ? `${d}일 늘리기` : `${-d}일 줄이기`})
            </button>
          ))}
        </div>
      )}
      {message && (
        <p role="status" className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 shadow">
          {message}
        </p>
      )}
    </div>
  );
}
