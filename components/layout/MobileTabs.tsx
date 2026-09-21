export type PlannerTab = "input" | "result";

const TABS: { id: PlannerTab; label: string }[] = [
  { id: "input", label: "입력" },
  { id: "result", label: "결과" },
];

interface Props {
  active: PlannerTab;
  onChange: (tab: PlannerTab) => void;
}

/** 좁은 화면에서 좌/우 패널을 전환한다 (lg 이상에서는 숨김) */
export function MobileTabs({ active, onChange }: Props) {
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
        </button>
      ))}
    </div>
  );
}
