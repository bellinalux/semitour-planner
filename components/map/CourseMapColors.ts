/** 지도 바탕 — OpenFreeMap (키·가입 없음, OpenStreetMap 자료). 나중에 다른 지도 공급원으로 바꿀 때 여기만 고친다 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** 날짜 색 — 차트 범주 색 1~7번 순서 (8번 빨강은 '되돌아가는 구간'에 쓴다). 8일째부터는 회색 */
export const DAY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
export const BACKTRACK_COLOR = "#e34948";
export const dayColor = (index: number) => DAY_COLORS[index] ?? "#64748b";

/** 지도 글자(지명·도로·장소 이름) 언어 — 한국어 문서·화면은 ko, 외국어 문서는 그 언어 */
export type MapLang = "ko" | "en" | "ja" | "zh";

/**
 * 지도 스타일의 이름 글자를 고른 언어로 바꾼다 (MapLibre setStyle의 transformStyle에 넣는다).
 * 그 언어 이름이 없는 곳은 현지 이름 그대로. 도로 번호판(ref)처럼 이름이 아닌 글자는 건드리지 않는다.
 */
export function localizeLabels<T extends { layers: unknown[] }>(style: T, lang: MapLang): T {
  const name = ["coalesce", ["get", `name:${lang}`], ...(lang === "en" ? [["get", "name_en"]] : []), ["get", "name"]];
  return {
    ...style,
    layers: style.layers.map((l) => {
      const layer = l as { layout?: Record<string, unknown> };
      const field = layer.layout?.["text-field"];
      if (field === undefined || !JSON.stringify(field).includes('"name')) return l;
      return { ...layer, layout: { ...layer.layout, "text-field": name } };
    }),
  } as T;
}
