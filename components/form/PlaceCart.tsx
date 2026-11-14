"use client";

import { Loader2, MapPin } from "lucide-react";
import { useState } from "react";
import { postJson } from "@/lib/api";
import { fastPaste } from "@/lib/fastPaste";
import type { DayPlan, TripInput } from "@/types";

interface CartResponse {
  days: DayPlan[];
  dropped: { name: string; reason: string }[];
  matrix: "google" | "ors" | "estimate";
}

/**
 * 장소 담기 → 자동 배치 (마이로 방식). 넣고 싶은 장소를 한 줄에 하나씩 담으면 날짜별로 나누고,
 * 코스 엔진이 영업시간·점심·동선에 맞춰 순서와 시각을 정한다. AI가 처음부터 만드는 것과 달리 담은 장소가 확실히 들어간다.
 */
export function PlaceCart({ input, onApplyDays }: { input: TripInput; onApplyDays: (days: DayPlan[]) => void }) {
  const [text, setText] = useState("");
  const [days, setDays] = useState(Math.max(1, Math.min(10, input.days)));
  const [state, setState] = useState<{ status: "idle" | "loading" | "error" | "done"; message?: string }>({ status: "idle" });
  const places = text
    .split("\n")
    .map((l) => l.replace(/^[\s\-*•·\d.)]+/, "").trim())
    .filter(Boolean)
    .slice(0, 20);
  const city = input.destination.split(/[,·/]/)[0]?.trim() ?? "";

  const run = async () => {
    setState({ status: "loading" });
    try {
      const r = await postJson<CartResponse>("/api/place-cart", { places, city, country: input.destination, days, start: "09:00", ...(input.departureDate ? { date: input.departureDate } : {}) });
      onApplyDays(r.days);
      const route = r.matrix === "google" ? "구글 지도" : r.matrix === "ors" ? "무료 도로 경로" : "거리 어림";
      setState({ status: "done", message: `${r.days.length}일에 ${places.length - r.dropped.length}곳을 배치했습니다 (이동: ${route}).${r.dropped.length ? ` 못 넣은 곳: ${r.dropped.map((d) => `${d.name}(${d.reason})`).join(", ")}` : ""}` });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "배치하지 못했습니다." });
    }
  };

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-slate-800">
        <MapPin className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
        장소 담아 자동 배치
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-[11px] leading-4 text-slate-500">
          넣고 싶은 장소를 한 줄에 하나씩 담으면(최대 20곳) 가까운 곳끼리 날짜를 나누고, 영업시간·점심·이동 시간에 맞춰 순서와 시각을 정합니다. 지금 일정은 이 배치로 바뀝니다(되돌리기 가능).
        </p>
        <textarea
          aria-label="담을 장소"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={fastPaste(setText)}
          placeholder={"예)\n다자이후 텐만구\n유후인 민예촌\n긴린코 호수\n가마도 지옥\n후쿠오카 타워"}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-600">
            관광 일수
            <input type="number" min={1} max={10} value={days} onChange={(e) => setDays(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} className="w-14 rounded-md border border-slate-300 px-1.5 py-1 text-xs" />
          </label>
          <span className="text-[11px] text-slate-500">{places.length}곳 담음 · {city || "여행지를 먼저 넣으세요"}</span>
          <button
            type="button"
            onClick={() => void run()}
            disabled={state.status === "loading" || places.length === 0 || !city}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {state.status === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            자동 배치
          </button>
        </div>
        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"} className={`text-[11px] ${state.status === "error" ? "text-rose-700" : "text-emerald-700"}`}>
            {state.message}
          </p>
        )}
      </div>
    </details>
  );
}
