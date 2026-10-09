export type PlannerTab = "input" | "result" | "insight";

const TABS: { id: PlannerTab; label: string }[] = [
  { id: "input", label: "입력" },
  { id: "result", label: "결과" },
  { id: "insight", label: "추천" },
];

interface Props {
  active: PlannerTab;
  onChange: (tab: PlannerTab) => void;
  /** 탭 옆에 보여 줄 개수 (예: 확인할 추천 수) */
  counts?: Partial<Record<PlannerTab, number>>;
}

/** 좁은 화면에서 입력 / 결과 / 추천 화면을 전환한다 (lg 이상에서는 함께 보여 숨김) */
export function MobileTabs({ active, onChange, counts }: Props) {
  return (
    <div role="tablist" className="flex shrink-0 border-b border-slate-200 bg-white lg:hidden">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 border-b-2 py-2.5 text-sm font-medium ${
            active === tab.id
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500"
          }`}
        >
          {tab.label}
          {(counts?.[tab.id] ?? 0) > 0 && (
            <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">{counts?.[tab.id]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
