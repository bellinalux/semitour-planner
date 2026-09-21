import { Calculator } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AsyncState } from "@/types";

interface Props {
  /** 견적은 일정 결과에 의존하므로 일정 상태를 그대로 받는다 */
  state: AsyncState;
}

function QuoteSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="견적 계산 중">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function QuotePanel({ state }: Props) {
  return (
    <SectionCard
      title="견적서"
      description="원가 · 권장 판매가 · 인원별 1인 단가 · 경쟁사 비교"
      icon={Calculator}
    >
      {state.status === "loading" ? (
        <QuoteSkeleton />
      ) : (
        <EmptyState
          icon={Calculator}
          title="일정이 만들어지면 견적이 계산됩니다"
          description="고정비와 일정의 입장료·식대를 합산해 목표 마진율 기준 권장 판매가를 역산합니다."
        />
      )}
    </SectionCard>
  );
}
