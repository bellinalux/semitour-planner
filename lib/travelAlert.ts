/** 외교부 여행경보단계 표시용 (서버·화면 공용) */
export const ALERT_LABELS: Record<number, string> = {
  0: "지정 없음",
  1: "1단계 여행유의",
  2: "2단계 여행자제",
  3: "3단계 출국권고",
  4: "4단계 여행금지",
};

/** 단계에 맞는 배경·글자 색 */
export function alertTone(level: number): string {
  if (level >= 4) return "bg-slate-800 text-white";
  if (level === 3) return "bg-red-50 text-red-800";
  if (level === 2) return "bg-amber-50 text-amber-800";
  if (level === 1) return "bg-sky-50 text-sky-800";
  return "bg-slate-100 text-slate-700";
}
