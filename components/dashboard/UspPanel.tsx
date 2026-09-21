import { AlertTriangle, RefreshCw, Sparkles, Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AsyncState, UspItem } from "@/types";

interface Props {
  state: AsyncState;
  items: UspItem[];
  /** 결과를 만든 뒤 일정/가격/경쟁사 정보가 바뀐 경우 */
  isStale: boolean;
  /** 일정과 견적이 준비되어 USP를 만들 수 있는 상태인지 */
  canGenerate: boolean;
  onGenerate: () => void;
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

function RegenerateButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

export function UspPanel({ state, items, isStale, canGenerate, onGenerate }: Props) {
  const isLoading = state.status === "loading";

  return (
    <SectionCard
      title="세일즈 포인트 (USP)"
      description="경쟁사 대비 이 투어의 장점 3가지"
      icon={Trophy}
      action={state.status === "success" ? <RegenerateButton onClick={onGenerate} label="다시 생성" /> : undefined}
    >
      {isLoading && <UspSkeleton />}

      {state.status === "error" && (
        <ErrorBanner
          title="USP를 생성하지 못했습니다"
          message={state.error ?? "잠시 후 다시 시도해 주세요."}
          onRetry={canGenerate ? onGenerate : undefined}
        />
      )}

      {state.status === "idle" && (
        <div className="flex flex-col items-center gap-3">
          <EmptyState
            icon={Trophy}
            title={canGenerate ? "USP를 생성할 수 있습니다" : "일정과 견적이 만들어지면 생성됩니다"}
            description="경쟁사에 없는 포함 항목과 가격 경쟁력을 근거와 함께 정리합니다. 경쟁사 정보를 입력할수록 정확해집니다."
          />
          {canGenerate && (
            <button
              type="button"
              onClick={onGenerate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              USP 생성
            </button>
          )}
        </div>
      )}

      {state.status === "success" && (
        <div className="space-y-4">
          {isStale && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              일정·가격·경쟁사 정보가 바뀌었습니다. 현재 내용으로 다시 생성하세요.
            </p>
          )}
          <ol className="space-y-3">
            {items.map((item, index) => (
              <li key={index} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.reason}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-slate-400">
            입력한 일정·가격·경쟁사 정보만을 근거로 AI가 작성했습니다. 고객에게 전달하기 전에 사실 여부를 확인하세요.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
