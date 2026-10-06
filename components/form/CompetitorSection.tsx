import { Plus, Swords } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { createCompetitor, MAX_COMPETITORS } from "@/lib/defaults";
import type { Competitor, CompareBasis } from "@/types";
import { CompetitorCard } from "./CompetitorCard";
import { CompetitorFinder } from "./CompetitorFinder";
import type { SectionProps } from "./types";

const COMPARE_BASES: { id: CompareBasis; label: string; hint: string }[] = [
  { id: "total", label: "총액 기준", hint: "항공·숙박까지 합친 금액으로 맞춤 (한쪽에만 있으면 다른 쪽에 더함)" },
  { id: "land", label: "랜드(지상) 기준", hint: "항공·숙박을 뺀 지상 일정 가격으로 맞춤" },
];

export function CompetitorSection({ input, onChange, openSignal }: SectionProps) {
  const { competitors } = input;
  const canAdd = competitors.length < MAX_COMPETITORS;

  const replace = (id: string, next: Competitor) =>
    onChange({ competitors: competitors.map((c) => (c.id === id ? next : c)) });
  const remove = (id: string) => onChange({ competitors: competitors.filter((c) => c.id !== id) });
  const add = () => onChange({ competitors: [...competitors, createCompetitor()] });

  return (
    <SectionCard
      title="경쟁사 정보"
      description="가격 비교와 세일즈 포인트(USP) 생성에 사용합니다"
      icon={Swords}
      collapsible
      defaultOpen={false}
      anchorId="settings-competitors"
      openSignal={openSignal}
      summary={competitors.length === 0 ? "등록된 경쟁사 없음" : `경쟁사 ${competitors.length}곳`}
      action={
        <button
          type="button"
          onClick={add}
          disabled={!canAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          추가
        </button>
      }
    >
      {competitors.length === 0 ? (
        <EmptyState
          icon={Swords}
          title="등록된 경쟁사가 없습니다"
          description="아래 버튼으로 대형 여행사 상품을 찾아 넣거나, 직접 가격과 포함 항목을 입력하세요. (선택 사항)"
        />
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <span className="mb-1.5 block text-xs font-medium text-slate-700">가격 비교 기준</span>
            <div role="radiogroup" aria-label="가격 비교 기준" className="grid grid-cols-2 gap-2">
              {COMPARE_BASES.map((basis) => {
                const selected = input.compareBasis === basis.id;
                return (
                  <button
                    key={basis.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange({ compareBasis: basis.id })}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      selected ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-slate-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <span className={`block text-xs font-semibold ${selected ? "text-indigo-800" : "text-slate-700"}`}>{basis.label}</span>
                    <span className="mt-0.5 block text-[10px] leading-3 text-slate-500">{basis.hint}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
              항공·숙박 포함 여부가 다른 상품끼리는 표시 가격만 비교하면 틀립니다. 선택한 기준으로 양쪽을 같은 범위로 맞춰 비교하며, 항공·숙박 금액은 우리 입력값(원가)을 씁니다.
            </p>
          </div>
          {competitors.map((competitor, index) => (
            <CompetitorCard
              key={competitor.id}
              index={index}
              competitor={competitor}
              currency={input.currency}
              onChange={(next) => replace(competitor.id, next)}
              onRemove={() => remove(competitor.id)}
            />
          ))}
          {!canAdd && (
            <p className="text-center text-[11px] text-slate-500">
              경쟁사는 최대 {MAX_COMPETITORS}개까지 등록할 수 있습니다.
            </p>
          )}
        </div>
      )}

      <CompetitorFinder input={input} onChange={onChange} />
    </SectionCard>
  );
}
