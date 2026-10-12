"use client";

import { useEffect, useState } from "react";
import { BACKTRACK_COLOR, dayColor } from "@/components/map/CourseMapColors";
import { captureMap, type MapShot } from "@/lib/printMap";
import { backtrackLegs, type MapPoint } from "@/lib/regionPlan";

/**
 * 인쇄용 지도 — 바탕 지도(OpenFreeMap) 그림 위에 날짜별 번호·코스 선을 겹쳐 그린다.
 * 지도 그림을 찍는 동안은 data-print-pending이 붙어 있어 인쇄가 기다린다. 못 찍으면 fallback(좌표 그림)을 보여 준다.
 * lines: 날짜마다 점들 / colorIndex: 첫 줄의 날짜 색 번호 (날짜별 작은 지도는 그날 색)
 */
export function MapFigure({ lines, width, height, colorIndex = 0, label, fallback = null }: { lines: MapPoint[][]; width: number; height: number; colorIndex?: number; label: string; fallback?: React.ReactNode }) {
  const pts = lines.flat();
  const key = pts.map((p) => `${p.lat},${p.lng}`).join(";");
  const [shot, setShot] = useState<{ key: string; shot: MapShot | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void captureMap(pts, width, height).then((s) => alive && setShot({ key, shot: s }));
    return () => {
      alive = false;
    };
    // 점이 바뀔 때만 다시 찍는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height]);
  const done = shot?.key === key;
  if (!done) return <div data-print-pending="map" style={{ aspectRatio: `${width} / ${height}` }} className="w-full rounded border border-slate-200 bg-slate-50" aria-label={`${label} 지도 그리는 중`} />;
  if (!shot.shot) return <>{fallback}</>;
  const { url, xy } = shot.shot;
  // 점 순서대로 위치를 나눠 갖는다
  let k = 0;
  const placed = lines.map((ps) => ps.map((p) => ({ p, at: xy[k++] })));
  const at = (id: string) => placed.flat().find((q) => q.p.id === id)?.at ?? [0, 0];
  return (
    <figure className="relative w-full overflow-hidden rounded border border-slate-200" style={{ aspectRatio: `${width} / ${height}` }} aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 인쇄용 지도 그림 (data URL) */}
      <img src={url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" role="img" aria-label={label}>
        {placed.map((ps, i) =>
          ps.length > 1 ? (
            <polyline key={`l${i}`} points={ps.map((q) => `${q.at[0]},${q.at[1]}`).join(" ")} fill="none" stroke={dayColor(colorIndex + i)} strokeWidth={3} strokeLinejoin="round" opacity={0.9} />
          ) : null,
        )}
        {lines.flatMap((ps) =>
          backtrackLegs(ps).map((b, j) => {
            const [x1, y1] = at(b.from.id);
            const [x2, y2] = at(b.to.id);
            return <line key={`b${b.from.id}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={BACKTRACK_COLOR} strokeWidth={3} strokeDasharray="6 4" />;
          }),
        )}
        {placed.flatMap((ps, i) =>
          ps.map(({ p, at: [x, y] }) => (
            <g key={p.id}>
              <circle cx={x} cy={y} r={p.kind === "sight" ? 9 : 8} fill={p.kind === "sight" ? dayColor(colorIndex + i) : "#ffffff"} stroke={p.kind === "sight" ? "#ffffff" : dayColor(colorIndex + i)} strokeWidth={2.5} />
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill={p.kind === "sight" ? "#ffffff" : dayColor(colorIndex + i)}>
                {p.kind === "hotel" ? "H" : p.order}
              </text>
            </g>
          )),
        )}
      </svg>
      <figcaption className="absolute bottom-0 right-0 bg-white/80 px-1 text-[7px] text-slate-500">© OpenStreetMap · OpenFreeMap</figcaption>
    </figure>
  );
}
