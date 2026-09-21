import { Compass } from "lucide-react";

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Compass className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold text-slate-900">세미투어 플래너</h1>
          <p className="hidden text-[11px] text-slate-500 sm:block">기획 · 견적 자동화</p>
        </div>
      </div>
      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">
        MVP
      </span>
    </header>
  );
}
