import { Plus, Swords } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { createCompetitor, MAX_COMPETITORS } from "@/lib/defaults";
import type { Competitor } from "@/types";
import { CompetitorCard } from "./CompetitorCard";
import type { SectionProps } from "./types";

export function CompetitorSection({ input, onChange }: SectionProps) {
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
          description="경쟁사 상품의 가격과 포함 항목을 넣으면 비교표와 USP가 만들어집니다. (선택 사항)"
        />
      ) : (
        <div className="space-y-3">
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
    </SectionCard>
  );
}
