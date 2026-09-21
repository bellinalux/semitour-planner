/** 분 → "1시간 30분" / "45분" */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0분";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
