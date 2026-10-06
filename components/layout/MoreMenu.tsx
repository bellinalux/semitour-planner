"use client";

import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * 상단 [더보기] — 가끔 쓰는 메뉴(회사 설정, 이력·백업, 상세페이지로, 의견, 오류 기록)를 한곳에 모은다.
 * 안의 메뉴들은 각자 대화상자를 갖고 있어 목록을 닫아도 화면에서 지우지 않고 숨기기만 한다(대화상자는 계속 보인다).
 */
export function MoreMenu({ children, attention }: { children: React.ReactNode; attention?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Menu className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">더보기</span>
        {attention && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" aria-label="확인할 항목 있음" />}
      </button>
      <div
        className={`more-menu-panel absolute right-0 top-full z-40 mt-1 flex w-52 flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ${open ? "" : "invisible"}`}
        onClick={(e) => {
          // 대화상자를 여는 메뉴를 누르면 목록은 닫는다 (작은 펼침 메뉴는 목록 안에 그대로 펼친다)
          const button = (e.target as HTMLElement).closest("button");
          if (button?.getAttribute("aria-haspopup") === "dialog" && button.parentElement === e.currentTarget) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
