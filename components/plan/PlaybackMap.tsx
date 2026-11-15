"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { captureMap, type MapShot } from "@/lib/printMap";

export interface PlaybackPoint {
  name: string;
  lat: number;
  lng: number;
  time: string;
  /** 앞 장소에서 이 장소까지 이동 (분) — 2시간 넘으면 빨간 선 */
  ride: number;
  /** 21시 넘어 시작하면 빨간 점 */
  late: boolean;
}

/**
 * 하루 동선 재생 — 지도 위에서 방문 순서대로 점이 옮겨 가며 시각을 보여 준다 (긴 이동·늦은 시각은 빨간색).
 * 지도 바탕은 무료 OpenStreetMap(OpenFreeMap) 그림이라 휴대폰에서도 가볍다.
 */
export function PlaybackMap({ points, label }: { points: PlaybackPoint[]; label: string }) {
  const key = points.map((p) => `${p.lat},${p.lng}`).join(";");
  const [shot, setShot] = useState<{ key: string; shot: MapShot | null } | null>(null);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    void captureMap(points, 640, 360).then((s) => alive && setShot({ key, shot: s }));
    return () => {
      alive = false;
    };
    // 점이 바뀔 때만 다시 그린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setAt((i) => (i + 1 >= points.length ? (setPlaying(false), i) : i + 1)), 1200);
    return () => window.clearInterval(t);
  }, [playing, points.length]);

  if (points.length < 2) return null;
  const cur = points[Math.min(at, points.length - 1)];
  const ready = shot?.key === key && shot.shot;
  return (
    <figure aria-label={label} className="space-y-1.5">
      <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50" style={{ aspectRatio: "640 / 360" }}>
        {ready ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- 지도 바탕 그림 (data URL) */}
            <img src={shot.shot!.url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
            <svg viewBox="0 0 640 360" className="absolute inset-0 h-full w-full" role="img" aria-label={`${label} — ${cur.time} ${cur.name}`}>
              {points.slice(1).map((p, i) => {
                const [x1, y1] = shot.shot!.xy[i];
                const [x2, y2] = shot.shot!.xy[i + 1];
                const done = i + 1 <= at;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={p.ride > 120 ? "#e34948" : done ? "#4f46e5" : "#94a3b8"} strokeWidth={done ? 4 : 2.5} strokeDasharray={done ? undefined : "5 4"} />;
              })}
              {points.map((p, i) => {
                const [x, y] = shot.shot!.xy[i];
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r={i === at ? 11 : 8} fill={p.late ? "#e34948" : i <= at ? "#4f46e5" : "#ffffff"} stroke={p.late ? "#ffffff" : "#4f46e5"} strokeWidth={2.5} />
                    <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill={p.late || i <= at ? "#ffffff" : "#4f46e5"}>
                      {i + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
            <figcaption className="absolute bottom-0 right-0 bg-white/80 px-1 text-[8px] text-slate-500">© OpenStreetMap · OpenFreeMap</figcaption>
          </>
        ) : (
          <p className="absolute inset-0 grid place-items-center text-xs text-slate-400">{shot?.key === key ? "지도를 그리지 못했습니다" : "지도 그리는 중…"}</p>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => {
            if (at >= points.length - 1) setAt(0);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? "멈춤" : "동선 재생"}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700"
        >
          {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
          {playing ? "멈춤" : "동선 재생"}
        </button>
        <input type="range" min={0} max={points.length - 1} value={at} onChange={(e) => setAt(Number(e.target.value))} aria-label="동선 위치" className="flex-1" />
        <span className={`tabular-nums ${cur.late ? "font-semibold text-rose-600" : "text-slate-700"}`}>
          {cur.time} {cur.name}
        </span>
      </div>
    </figure>
  );
}
