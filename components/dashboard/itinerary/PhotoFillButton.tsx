"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { postJson } from "@/lib/api";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { photoOf } from "@/lib/photo";
import type { DayPlan, ItineraryItem } from "@/types";

const SKIP = new Set(["flight", "transfer", "hotel", "free_time", "meal"]);

/**
 * 장소 사진 넣기 — 사진이 없는 관광지마다 위키백과·위키미디어 공용의 무료 라이선스 사진을 찾아 넣는다 (출처는 문서에 함께 표시).
 * 직접 올린 사진은 그대로 둔다.
 */
export function PhotoFillButton({ days, pmChoice, city, onChangeItem }: { days: DayPlan[]; pmChoice: PmChoice; city: string; onChangeItem: (id: string, patch: Partial<ItineraryItem>) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const targets = days.flatMap((d) => dayItems(d, pmChoice)).filter((i) => !SKIP.has(i.type ?? "sightseeing") && !photoOf(i));
  if (targets.length === 0 && !message) return null;
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={busy || targets.length === 0}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const names = [...new Set(targets.map((i) => i.name))].slice(0, 20);
            const r = await postJson<{ photos: { name: string; url: string; credit: string }[] }>("/api/place-photos", { city, names });
            let n = 0;
            for (const it of targets) {
              const p = r.photos.find((x) => x.name === it.name);
              if (!p) continue;
              onChangeItem(it.id, { photoUrl: p.url, photoCredit: p.credit });
              n += 1;
            }
            setMessage(n > 0 ? `장소 ${n}곳에 사진을 넣었습니다 (위키미디어 공용, 출처는 문서에 표시).` : "무료 라이선스 사진을 찾지 못했습니다. 직접 올려 주세요.");
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "사진을 찾지 못했습니다.");
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
        장소 사진 넣기{targets.length > 0 ? ` (${targets.length})` : ""}
      </button>
      {message && (
        <span role="status" className="mt-1 text-[11px] text-emerald-700">
          {message}
        </span>
      )}
    </span>
  );
}
