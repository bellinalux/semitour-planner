import { ArrowDownCircle, ArrowUpCircle, Undo2 } from "lucide-react";
import type { BudgetFitView } from "@/hooks/useBudgetFit";
import { describeAction } from "@/lib/budgetFit";

/**
 * 예산 맞추기 — 예산을 넘으면 줄일 내용을 미리 보여 주고 한 번에 적용(되돌리기 가능),
 * 남으면 남은 금액 안에서 올릴 방법(숙소 한 단계 위, 추천 투어 포함)을 보여 준다.
 */
export function BudgetFitBox({ fit }: { fit: BudgetFitView }) {
  const { plan, upgrades, applied, money } = fit;

  if (applied.length > 0) {
    return (
      <div className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-4 text-emerald-900">
        <p className="font-semibold">예산에 맞춰 바꿨습니다</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {applied.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <button type="button" onClick={fit.undo} className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-100">
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          되돌리기
        </button>
      </div>
    );
  }

  if (plan) {
    return (
      <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-900">
        <p className="flex items-center gap-1.5 font-semibold">
          <ArrowDownCircle className="h-3.5 w-3.5" aria-hidden />
          예산 맞추기 — 1인 {money(plan.deficit)}을 줄여야 합니다
        </p>
        {plan.actions.length > 0 ? (
          <>
            <ul className="list-disc space-y-0.5 pl-4">
              {plan.actions.map((a) => (
                <li key={a.kind === "to-option" ? a.itemId : a.city}>{describeAction(a, money)}</li>
              ))}
            </ul>
            {!plan.enough && <p>이것만으로는 1인 {money(-plan.gapAfter)}이 더 모자랍니다 — 판매가를 올리거나 차량·가이드비를 확인하세요.</p>}
            <button type="button" onClick={fit.apply} className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700">
              이대로 예산에 맞추기
            </button>
            <span className="ml-2 text-amber-700">선택 옵션으로 옮긴 체험은 고객이 원하면 따로 신청합니다. 적용한 뒤 되돌릴 수 있습니다.</span>
          </>
        ) : (
          <p>자동으로 줄일 유료 체험·숙소 후보가 없습니다. 판매가를 올리거나(위 최소 판매가 참고) 차량·가이드비·식대를 직접 조정하세요.</p>
        )}
      </div>
    );
  }

  if (upgrades.length > 0) {
    return (
      <div className="space-y-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-[11px] leading-4 text-indigo-900">
        <p className="flex items-center gap-1.5 font-semibold">
          <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden />
          남은 예산으로 올릴 수 있는 것 (그대로 두면 회사 이익으로 남습니다)
        </p>
        <ul className="space-y-1">
          {upgrades.map((u) => (
            <li key={u.kind === "hotel" ? `h-${u.city}` : `t-${u.tour.name}`} className="flex flex-wrap items-center justify-between gap-2">
              <span>{u.kind === "hotel" ? `${u.city} 숙소를 ${u.hotel.name}(으)로` : `${u.tour.name} 판매가에 포함`} (1인 +{money(u.extraPerPerson)})</span>
              <button type="button" onClick={() => fit.upgrade(u)} className="rounded-md border border-indigo-300 bg-white px-2 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-100">
                올리기
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return null;
}
