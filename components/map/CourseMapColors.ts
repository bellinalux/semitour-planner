/** 날짜 색 — 차트 범주 색 1~7번 순서 (8번 빨강은 '되돌아가는 구간'에 쓴다). 8일째부터는 회색 */
export const DAY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
export const BACKTRACK_COLOR = "#e34948";
export const dayColor = (index: number) => DAY_COLORS[index] ?? "#64748b";
