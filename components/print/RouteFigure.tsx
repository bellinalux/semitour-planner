import { dayColor, BACKTRACK_COLOR } from "@/components/map/CourseMapColors";
import { backtrackLegs, dayDistance, mapPoints, type HotelPins } from "@/lib/regionPlan";
import type { PmChoice } from "@/lib/itinerary";
import type { DayPlan } from "@/types";

/**
 * 인쇄용 코스 그림 — 지도 바탕 없이 좌표로 그린 날짜별 동선 (북쪽이 위, 경도는 위도에 맞춰 줄인다).
 * 인쇄에서는 지도 타일이 잘 안 나와서 그림으로 넣는다. 좌표가 3곳 이상일 때만.
 */
export function RouteFigure({ days, pmChoice, hotels = {} }: { days: DayPlan[]; pmChoice: PmChoice; hotels?: HotelPins }) {
  const all = mapPoints(days, pmChoice, hotels);
  const pts = all.flat();
  if (pts.length < 3) return null;
  const W = 640;
  const H = 300;
  const pad = 24;
  const midLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * kx);
  const ys = pts.map((p) => p.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, (maxY - minY) * ((W - pad * 2) / (H - pad * 2)), 1e-4);
  const scale = (W - pad * 2) / span;
  const ox = pad + (W - pad * 2 - (maxX - minX) * scale) / 2;
  const oy = pad + (H - pad * 2 - (maxY - minY) * scale) / 2;
  const x = (lng: number) => ox + (lng * kx - minX) * scale;
  const y = (lat: number) => H - oy - (lat - minY) * scale;
  return (
    <figure className="break-inside-avoid">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded border border-slate-200 bg-slate-50" role="img" aria-label="날짜별 코스 그림">
        {all.map((p, i) =>
          p.length > 1 ? <polyline key={`l${i}`} points={p.map((q) => `${x(q.lng)},${y(q.lat)}`).join(" ")} fill="none" stroke={dayColor(i)} strokeWidth={2} strokeLinejoin="round" opacity={0.85} /> : null,
        )}
        {all.flatMap((p, i) =>
          backtrackLegs(p).map((b, k) => <line key={`b${i}-${k}`} x1={x(b.from.lng)} y1={y(b.from.lat)} x2={x(b.to.lng)} y2={y(b.to.lat)} stroke={BACKTRACK_COLOR} strokeWidth={2.5} strokeDasharray="5 4" />),
        )}
        {all.flatMap((p, i) =>
          p.map((q) => (
            <g key={q.id}>
              <circle cx={x(q.lng)} cy={y(q.lat)} r={8} fill={q.kind === "sight" ? dayColor(i) : "#ffffff"} stroke={q.kind === "sight" ? "#ffffff" : dayColor(i)} strokeWidth={2} />
              <text x={x(q.lng)} y={y(q.lat) + 3} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={q.kind === "sight" ? "#ffffff" : dayColor(i)}>
                {q.kind === "hotel" ? "H" : q.order}
              </text>
            </g>
          )),
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-slate-600">
        {days.map((d, i) =>
          all[i].length > 0 ? (
            <span key={d.day} className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-full" style={{ background: dayColor(i) }} />
              DAY {d.day}: {all[i].filter((q) => q.kind === "sight").map((q) => `${q.order}.${q.name}`).join(" ")}
              {all[i].length >= 2 && <span className="text-slate-400">({dayDistance(all[i]).km}km)</span>}
            </span>
          ) : null,
        )}
      </figcaption>
    </figure>
  );
}
