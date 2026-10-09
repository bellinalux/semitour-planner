"use client";

import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { fillFromMemory, recallCosts } from "@/lib/costMemory";
import { setupChecklist } from "@/lib/setupChecklist";
import type { TripInput } from "@/types";
import { CostSection } from "./CostSection";
import { PackageSection } from "./PackageSection";
import type { SettingsFocus } from "./settingsFocus";
import type { SectionProps } from "./types";

/** 이 여행지로 지난 견적에서 쓴 원가가 있으면 비어 있는 칸에 불러올 수 있게 알려 준다 */
function MemoryHint({ input, onChange }: { input: TripInput; onChange: (patch: Partial<TripInput>) => void }) {
  const [, force] = useState(0);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소는 마운트 뒤에만 읽는다
  useEffect(() => setMounted(true), []);
  if (!mounted || !input.destination.trim()) return null;
  const entry = recallCosts(input.destination, input.currency);
  const fill = entry ? fillFromMemory(input) : null;
  if (!entry || !fill) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-2 text-[11px] leading-4 text-indigo-900">
      지난 &quot;{entry.destination}&quot; 견적({entry.savedAt.slice(0, 10)})에서 쓴 {fill.applied.join(", ")} 값이 있습니다.
      <button
        type="button"
        onClick={() => {
          onChange(fill.patch);
          force((n) => n + 1);
        }}
        className="font-semibold underline underline-offset-2"
      >
        비어 있는 칸에 불러오기
      </button>
    </p>
  );
}

/**
 * 폴더 4. 원가 직접 입력 (선택) — 아는 원가만 넣는다. 비워 두면 자동 구성·자동 견적이 시세로 채운다.
 * 안에 고정비(차량·가이드·팁·보험)와 숙박·항공 원가를 하위 폴더로 둔다.
 */
export function CostFolder({ input, onChange, stays, focus }: SectionProps & { stays: { city: string; nights: number }[]; focus: SettingsFocus | null }) {
  const signal = (s: SettingsFocus["section"]) => (focus?.section === s ? focus.n : undefined);
  const items = setupChecklist(input).filter((i) => i.section === "cost" || i.section === "package");
  const summary = items.length > 0 ? items.map((i) => `${i.label} ${i.done ? "✓" : "비어 있음"}`).join(" · ") : "비워 두면 시세로 채웁니다";
  return (
    <SectionCard
      title="4. 원가 직접 입력 (선택)"
      description="아는 원가만 넣으세요. 비워 두면 자동 구성이 시세로 채웁니다"
      icon={Wallet}
      collapsible
      defaultOpen={false}
      openSignal={signal("cost") ?? signal("package")}
      summary={summary}
    >
      <div className="space-y-3">
        <MemoryHint input={input} onChange={onChange} />
        <CostSection input={input} onChange={onChange} openSignal={signal("cost")} />
        <PackageSection input={input} onChange={onChange} stays={stays} openSignal={signal("package")} />
      </div>
    </SectionCard>
  );
}
