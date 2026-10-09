"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** true면 제목을 눌러 접고 펼 수 있다. 접어도 내용은 그대로 유지된다(검색 결과·입력값이 사라지지 않는다) */
  collapsible?: boolean;
  /** collapsible일 때 처음에 펼쳐 둘지 */
  defaultOpen?: boolean;
  /** 접힌 상태에서 제목 옆에 보여주는 현재 설정 요약 */
  summary?: React.ReactNode;
  /** 이 값이 바뀌면(값이 있을 때) 접혀 있어도 펼친다. 다른 화면에서 이 항목으로 이동시킬 때 쓴다 */
  openSignal?: number;
  /** 이동·스크롤 대상으로 쓰는 id */
  anchorId?: string;
  /** 폴더 안의 하위 항목 — 그림자 없이 옅게 */
  nested?: boolean;
}

export function SectionCard({ title, description, icon: Icon, action, children, collapsible, defaultOpen = true, summary, openSignal, anchorId, nested }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  // 신호가 바뀌면(다른 화면에서 이 항목으로 이동시킨 경우) 렌더 중에 바로 펼친다
  const [seenSignal, setSeenSignal] = useState(openSignal);
  if (openSignal !== seenSignal) {
    setSeenSignal(openSignal);
    if (openSignal) setOpen(true);
  }
  const expanded = !collapsible || open;

  const heading = (
    <>
      {Icon && (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0 text-left">
        <h2 className={`text-balance font-semibold text-slate-900 ${nested ? "text-xs" : "text-sm"}`}>{title}</h2>
        {description && expanded && <p className="mt-0.5 text-pretty text-xs text-slate-500">{description}</p>}
        {collapsible && !expanded && summary && <p className="mt-0.5 truncate text-xs text-slate-500">{summary}</p>}
      </div>
    </>
  );

  return (
    <section id={anchorId} className={`scroll-mt-3 border border-slate-200 ${nested ? "rounded-lg bg-slate-50/60" : "rounded-xl bg-white shadow-sm"}`}>
      <header className={`flex items-start justify-between gap-3 ${nested ? "px-3 py-2.5" : "px-4 py-3"} ${expanded ? "border-b border-slate-100" : ""}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {heading}
            <ChevronDown className={`ml-auto mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
        ) : (
          <div className="flex items-start gap-2.5">{heading}</div>
        )}
        {action}
      </header>
      <div className={nested ? "p-3" : "p-4"} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
