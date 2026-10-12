/**
 * 인쇄용 지도 그림 — 화면 지도(OpenFreeMap, MapLibre)를 화면 밖에서 같은 범위로 그려 PNG로 찍고,
 * 점마다 그림 위 위치(px)를 돌려준다. 그 위에 번호·코스 선을 SVG로 겹쳐 그린다.
 * 인쇄는 지도 타일이 그려지기 전에 시작되면 바탕이 비어서, 그림으로 바꿔 넣고 다 찍힌 뒤 인쇄한다.
 * 한 번에 하나씩 찍는다 (WebGL 화면을 여러 개 동시에 만들지 않게).
 */

import { MAP_STYLE_URL } from "@/components/map/CourseMapColors";

export interface MapShot {
  /** PNG data URL */
  url: string;
  /** 점마다 그림 위 위치 [x, y] (그림 크기 기준 px) */
  xy: [number, number][];
}

let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<MapShot | null>>();

/** 지도가 다 그려질 때까지 이만큼만 기다린다 (그 뒤에는 좌표 그림으로 대신) */
const TIMEOUT_MS = 8000;

async function shoot(points: { lat: number; lng: number }[], width: number, height: number): Promise<MapShot | null> {
  if (typeof window === "undefined" || points.length === 0) return null;
  const ml = await import("maplibre-gl");
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(el);
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  let map: import("maplibre-gl").Map | null = null;
  try {
    map = new ml.Map({
      container: el,
      style: MAP_STYLE_URL,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: 2,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      bounds: [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      fitBoundsOptions: { padding: 36, maxZoom: 15 },
    });
    const m = map;
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
      m.once("idle", () => {
        window.clearTimeout(t);
        resolve();
      });
    });
    const url = m.getCanvas().toDataURL("image/png");
    if (!url.startsWith("data:image/png")) return null;
    const xy = points.map((p) => {
      const q = m.project([p.lng, p.lat]);
      return [q.x, q.y] as [number, number];
    });
    return { url, xy };
  } catch {
    return null;
  } finally {
    map?.remove();
    el.remove();
  }
}

/** 지도 그림 (같은 점·크기는 한 번만 찍는다) */
export function captureMap(points: { lat: number; lng: number }[], width: number, height: number): Promise<MapShot | null> {
  const key = `${width}x${height}:${points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const run = () => shoot(points, width, height);
  const p = queue.then(run, run);
  queue = p.catch(() => null);
  cache.set(key, p);
  p.then((r) => {
    if (!r) cache.delete(key);
  });
  return p;
}
