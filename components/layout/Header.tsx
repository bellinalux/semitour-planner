import Image from "next/image";
import { APP_VERSION } from "@/lib/version";

export function Header({ actions }: { actions?: React.ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
          <Image src="/logo-mark.png" alt="스케치북트래블 로고" width={32} height={32} className="h-8 w-8 object-contain" priority />
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
      <div className="flex items-center gap-2">
        {actions}
        <span className="hidden rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 sm:inline">MVP</span>
      </div>
    </header>
  );
}
