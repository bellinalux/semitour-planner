/** 분 → "1시간 30분" / "45분" */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0분";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/**
 * AI가 추정한 체류·이동 시간을 5분 단위로 반올림한다. "11:03"처럼 어색한 시각이 계산되지 않도록,
 * 일정에 들어가는 모든 시간 값은 이 단위로 맞춘다(여행사들이 실무에서 쓰는 방식과 같다).
 */
export function roundMinutes(minutes: number, step = 5): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.round(minutes / step) * step);
}
