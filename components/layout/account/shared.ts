/** 계정 메뉴 안에서 같이 쓰는 이름표·스타일·시각 표기 */
export const ROLE_LABEL = { admin: "관리자", staff: "직원" } as const;
export const buttonClass = "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
export const fieldClass = "rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

/** "10.6 16:46" (이 PC 시간대) */
export function when(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
