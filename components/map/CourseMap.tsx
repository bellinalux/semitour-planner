"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { backtrackLegs, type MapPoint } from "@/lib/regionPlan";
import { BACKTRACK_COLOR, dayColor } from "./CourseMapColors";

/** 지도 바탕 — OpenFreeMap (키·가입 없음, OpenStreetMap 자료). 나중에 다른 지도 공급원으로 바꿀 때 여기만 고친다 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export { BACKTRACK_COLOR, dayColor } from "./CourseMapColors";

interface Props {
  /** 날짜별 점 (보여 줄 날만) */
  days: { day: number; index: number; points: MapPoint[] }[];
  /** 핀을 끌어 좌표를 고칠 수 있게 */
  editable?: boolean;
  onMovePoint?: (id: string, lat: number, lng: number) => void;
  className?: string;
}

function pinElement(p: MapPoint, color: string, editable: boolean): HTMLElement {
  const el = document.createElement("div");
  const hotel = p.kind === "hotel";
  const meal = p.kind === "meal";
  el.textContent = hotel ? "H" : String(p.order);
  el.setAttribute("aria-label", `DAY ${p.day} ${p.order}번 ${p.name}`);
  el.style.cssText = [
    `width:${meal ? 20 : 24}px`,
    `height:${meal ? 20 : 24}px`,
    `border-radius:${hotel ? "6px" : "9999px"}`,
    `background:${meal || hotel ? "#ffffff" : color}`,
    `color:${meal || hotel ? color : "#ffffff"}`,
    `border:2px solid ${meal || hotel ? color : "#ffffff"}`,
    "box-shadow:0 1px 3px rgba(0,0,0,.35)",
    "display:flex;align-items:center;justify-content:center",
    "font:600 11px/1 system-ui,sans-serif",
    `cursor:${editable ? "grab" : "pointer"}`,
  ].join(";");
  el.title = `DAY ${p.day} · ${p.order}. ${p.name}${editable ? " (끌어서 위치 고치기)" : ""}`;
  return el;
}

/**
 * 코스 지도 — 날짜별 색 번호 핀과 방문 순서 선, 떠났던 지역으로 되돌아가는 구간은 빨간 점선.
 * 화면에 보일 때(크기가 생길 때) 지도를 만든다 (접힌 칸 안에서도 안전). WebGL을 못 쓰면 안내만.
 */
export function CourseMap({ days, editable = false, onMovePoint, className = "h-80" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const moveRef = useRef(onMovePoint);
  useEffect(() => {
    moveRef.current = onMovePoint;
  }, [onMovePoint]);

  // 보이면 지도를 만든다
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    const start = async () => {
      if (mapRef.current || el.clientWidth === 0) return;
      try {
        const ml = (await import("maplibre-gl")).default;
        if (cancelled || mapRef.current) return;
        const map = new ml.Map({ container: el, style: MAP_STYLE_URL, center: [127, 37.5], zoom: 3, attributionControl: { compact: true }, cooperativeGestures: true });
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", (e) => {
          // 바탕 타일 하나가 안 와도 지도는 쓴다 — 스타일 자체를 못 읽을 때만 실패로
          if (!map.isStyleLoaded() && /style/i.test(String(e.error?.message ?? ""))) setFailed(true);
        });
        map.on("load", () => setReady(true));
        mapRef.current = map;
      } catch {
        setFailed(true);
      }
    };
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize();
      else void start();
    });
    ro.observe(el);
    void start();
    return () => {
      cancelled = true;
      ro.disconnect();
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // 핀·선 그리기
  const sig = JSON.stringify([days.map((d) => [d.day, d.index, d.points.map((p) => [p.id, p.lat, p.lng, p.order, p.region])]), editable]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let alive = true;
    void (async () => {
      const ml = (await import("maplibre-gl")).default;
      if (!alive) return;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      const lines = days.map((d) => ({
        type: "Feature" as const,
        properties: { color: dayColor(d.index) },
        geometry: { type: "LineString" as const, coordinates: d.points.map((p) => [p.lng, p.lat]) },
      }));
      const back = days.flatMap((d) =>
        backtrackLegs(d.points).map((b) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: [[b.from.lng, b.from.lat], [b.to.lng, b.to.lat]] } })),
      );
      const setData = (id: string, features: unknown[]) => {
        const data = { type: "FeatureCollection", features } as GeoJSON.FeatureCollection;
        const src = map.getSource(id) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined;
        if (src?.setData) src.setData(data);
        else map.addSource(id, { type: "geojson", data });
      };
      setData("route", lines);
      setData("backtrack", back);
      if (!map.getLayer("route")) map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.85 } });
      if (!map.getLayer("backtrack")) map.addLayer({ id: "backtrack", type: "line", source: "backtrack", paint: { "line-color": BACKTRACK_COLOR, "line-width": 3, "line-dasharray": [2, 1.5] } });

      const bounds = new ml.LngLatBounds();
      for (const d of days)
        for (const p of d.points) {
          // 숙소 핀은 숙소 정보에서 온 것이라 끌어서 고치지 않는다
          const movable = editable && !p.id.startsWith("hotel-");
          const marker = new ml.Marker({ element: pinElement(p, dayColor(d.index), movable), draggable: movable })
            .setLngLat([p.lng, p.lat])
            .setPopup(new ml.Popup({ offset: 14, closeButton: false }).setText(p.kind === "hotel" ? `DAY ${p.day} · 숙소 ${p.name}` : `DAY ${p.day} · ${p.order}. ${p.name}${p.region ? ` (${p.region})` : ""}`))
            .addTo(map);
          if (movable)
            marker.on("dragend", () => {
              const ll = marker.getLngLat();
              moveRef.current?.(p.id, Math.round(ll.lat * 1e6) / 1e6, Math.round(ll.lng * 1e6) / 1e6);
            });
          markers.current.push(marker);
          bounds.extend([p.lng, p.lat]);
        }
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
    })();
    return () => {
      alive = false;
    };
    // sig가 그리는 내용 전체 (days 배열은 렌더마다 새로 만들어진다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ready]);

  return (
    <div className={`relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${className}`}>
      {/* maplibre가 이 칸에 position: relative를 붙이므로 크기는 h-full·w-full로 준다 */}
      <div ref={box} className="h-full w-full" data-testid="course-map" />
      {failed && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-slate-500">이 브라우저에서 지도를 그리지 못했습니다. 아래 날짜별 목록으로 확인하세요.</p>}
    </div>
  );
}
