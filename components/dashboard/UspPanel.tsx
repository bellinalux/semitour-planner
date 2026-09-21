import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AsyncState } from "@/types";

interface Props {
  state: AsyncState;
  onRetry: () => void;
}

function UspSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="USP 생성 중">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function UspPanel({ state, onRetry }: Props) {
  return (
    <SectionCard
      title="세일즈 포인트 (USP)"
      description="경쟁사 대비 이 투어의 장점 3가지"
      icon={Trophy}
    >
      {state.status === "loading" && <UspSkeleton />}
      {state.status === "error" && (
        <ErrorBanner
          title="USP를 생성하지 못했습니다"
          message={state.error ?? "잠시 후 다시 시도해 주세요."}
          onRetry={onRetry}
        />
      )}
      {(state.status === "idle" || state.status === "success") && (
        <EmptyState
          icon={Trophy}
          title="일정과 경쟁사 정보를 바탕으로 생성됩니다"
          description="경쟁사에 없는 포함 항목과 가격 경쟁력을 근거와 함께 정리합니다."
        />
      )}
    </SectionCard>
  );
}
