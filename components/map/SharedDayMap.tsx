"use client";

import { CourseMap } from "./CourseMap";
import type { MapPoint } from "@/lib/regionPlan";

interface Props {
  day: number;
  index: number;
  items: { name: string; kind: string; lat?: number; lng?: number }[];
  label: string;
}

/** 고객 웹 일정표의 날짜별 지도 — 펼칠 때 지도를 만든다 (좌표가 2곳 이상인 날만) */
export function SharedDayMap({ day, index, items, label }: Props) {
  let order = 0;
  const points: MapPoint[] = items
    .filter((i) => typeof i.lat === "number" && typeof i.lng === "number")
    .map((i, k) => ({ id: `${day}-${k}`, day, order: ++order, name: i.name, lat: i.lat!, lng: i.lng!, kind: i.kind === "hotel" ? "hotel" : i.kind === "meal" ? "meal" : "sight", region: null }));
  if (points.length < 2) return null;
  return (
    <details className="mt-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
      <summary className="cursor-pointer font-medium text-slate-600">{label}</summary>
      <CourseMap days={[{ day, index, points }]} className="mt-2 h-60" />
    </details>
  );
}
