"use client";

import { useContext } from "react";
import { CourseEngineContext } from "@/hooks/useCourseEngine";
import type { DayPlan, ItineraryItem } from "@/types";

const SKIP = new Set(["flight", "transfer", "hotel", "free_time"]);
const regionOf = (i: ItineraryItem) => (i.timeCheck?.basis === "area" ? i.timeCheck.region || i.timeCheck.area || null : null);

interface Props {
  plan: DayPlan;
  items: ItineraryItem[];
}

/**
 * 동선 그림 — 지도 키 없이도 동선 방향을 눈으로 본다.
 *  ① 지역 흐름: 그날 지나는 지역(시간 검증으로 붙은 큰 지역·구역)을 순서대로 화살표로, 떠났던 지역으로 되돌아오면 빨간색
 *  ② 위치 그림: 코스 점검에서 장소 좌표를 찾았으면(3곳 이상) 방문 순서대로 번호를 찍고 선으로 잇는다 (북쪽이 위)
 */
export function RouteSketch({ plan, items }: Props) {
  const engine = useContext(CourseEngineContext);
  const stops = items.filter((i) => !SKIP.has(i.type ?? "sightseeing") && i.type !== "meal");

  // ① 지역 흐름 (연속된 같은 지역은 하나로)
  const flow: { region: string; count: number; back: boolean }[] = [];
  const seen = new Set<string>();
  for (const it of stops) {
    const r = regionOf(it);
    if (!r) continue;
    const last = flow[flow.length - 1];
    if (last && last.region === r) {
      last.count += 1;
      continue;
    }
    flow.push({ region: r, count: 1, back: seen.has(r) });
    seen.add(r);
  }

  // ② 위치 그림 (코스 점검 결과의 좌표)
  const st = engine?.byDay[plan.day];
  const coords = st?.status === "done" ? st.res.places.filter((p) => p.lat != null && p.lng != null) : [];
  const pts = stops
    .map((s) => {
      const p = coords.find((c) => c.id === s.id);
      return p ? { name: s.name, lat: p.lat!, lng: p.lng! } : null;
    })
    .filter((p): p is { name: string; lat: number; lng: number } => p !== null);

  if (flow.length < 2 && pts.length < 3) return null;
  const W = 280;
  const H = 180;
  const pad = 16;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(maxLat - minLat, maxLng - minLng, 1e-4);
  const x = (lng: number) => pad + ((lng - minLng) / span) * (W - pad * 2);
  const y = (lat: number) => H - pad - ((lat - minLat) / span) * (H - pad * 2);

  return (
    <details className="mb-2 rounded-md border border-slate-200 px-3 py-2 text-[11px] leading-4">
      <summary className="cursor-pointer font-semibold text-slate-700">동선 그림</summary>
      {flow.length >= 2 && (
        <p className="mt-2 flex flex-wrap items-center gap-1" aria-label="지역 흐름">
          {flow.map((f, i) => (
            <span key={`${f.region}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 && <span className={f.back ? "font-bold text-red-600" : "text-slate-400"}>{f.back ? "↩" : "→"}</span>}
              <span className={`rounded px-1.5 py-0.5 ring-1 ${f.back ? "bg-red-50 text-red-700 ring-red-200" : "bg-indigo-50 text-indigo-800 ring-indigo-200"}`}>
                {f.region} <span className="text-slate-400">{f.count}곳</span>
              </span>
            </span>
          ))}
        </p>
      )}
      {flow.some((f) => f.back) && <p className="mt-1 text-red-700">↩ 표시는 떠났던 지역으로 되돌아온 곳입니다 (지그재그).</p>}
      {pts.length >= 3 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full max-w-sm rounded bg-slate-50" role="img" aria-label="방문 순서 위치 그림">
          <polyline points={pts.map((p) => `${x(p.lng)},${y(p.lat)}`).join(" ")} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="3 2" />
          {pts.map((p, i) => (
            <g key={`${p.name}-${i}`}>
              <circle cx={x(p.lng)} cy={y(p.lat)} r={7} fill={i === 0 ? "#059669" : "#4f46e5"} />
              <text x={x(p.lng)} y={y(p.lat) + 3} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">
                {i + 1}
              </text>
              <title>{`${i + 1}. ${p.name}`}</title>
            </g>
          ))}
        </svg>
      )}
      {pts.length >= 3 && <p className="mt-1 text-slate-400">코스 점검에서 찾은 장소 좌표로 그린 대략의 위치입니다 (위쪽이 북쪽, 도로가 아닌 직선).</p>}
      {pts.length < 3 && flow.length >= 2 && <p className="mt-1 text-slate-400">코스 점검을 하면 장소 위치 그림도 함께 보여 줍니다 (좌표를 찾은 곳만).</p>}
    </details>
  );
}
