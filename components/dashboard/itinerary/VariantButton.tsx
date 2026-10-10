"use client";

import { Loader2, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Companion, TravelType, TripInput, TripPace } from "@/types";

/** 고객 유형별 변형 — 같은 여행지·기간으로 동반자·강도·여행 유형만 바꿔 코스를 다시 만든다 */
export const VARIANTS: { key: "senior" | "family" | "couple"; label: string; hint: string; patch: { companions: Companion[]; pace: TripPace; travelType: TravelType } }[] = [
  { key: "senior", label: "시니어판", hint: "계단·긴 도보 적게, 늦은 출발·쉬는 시간 넉넉히", patch: { companions: ["senior"], pace: "relaxed", travelType: "senior" } },
  { key: "family", label: "가족판", hint: "아이가 즐길 체험·동물·물놀이, 이동 짧게", patch: { companions: ["kids"], pace: "normal", travelType: "package" } },
  { key: "couple", label: "커플판", hint: "야경·일몰·분위기 좋은 식당", patch: { companions: ["couple"], pace: "normal", travelType: "honeymoon" } },
];

export function VariantButton({ onMake }: { onMake: (patch: Partial<TripInput>, label: string) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy !== ""}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Users className="h-4 w-4" aria-hidden />}
        {busy ? `${busy} 만드는 중…` : "고객 유형별 변형"}
      </button>
      {open && (
        <div role="menu" aria-label="고객 유형별 변형" className="absolute right-0 top-full z-30 mt-1 w-72 space-y-1 rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-lg">
          <p className="px-1 text-[11px] text-slate-500">지금 상품은 저장해 두고, 같은 여행지·기간으로 이 고객 유형에 맞춰 코스를 다시 만듭니다.</p>
          {VARIANTS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                setBusy(v.label);
                setMessage("");
                try {
                  setMessage(await onMake(v.patch, v.label));
                } finally {
                  setBusy("");
                }
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
            >
              <b className="text-slate-800">{v.label}</b>
              <span className="block text-[11px] text-slate-500">{v.hint}</span>
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
