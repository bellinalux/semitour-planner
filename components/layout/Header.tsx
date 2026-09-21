import { Compass } from "lucide-react";
import { APP_VERSION } from "@/lib/version";

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Compass className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="leading-tight">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            세미투어 플래너
            <span
              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-700 tabular-nums"
              title="마지막 수정 날짜와 번호"
            >
              {APP_VERSION}
            </span>
          </h1>
          <p className="hidden text-[11px] text-slate-500 sm:block">기획 · 견적 자동화</p>
        </div>
      </div>
      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">MVP</span>
    </header>
  );
}
