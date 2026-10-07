import { TOUR_CATEGORIES } from "@/lib/itemTypes";
import type { TourCandidate, ViatorSearchResult } from "@/types";

/** Viator에서 실제로 판매 중인 상품 목록 (정가·평점·후기) */
export function ViatorResults({ data, renderCard }: { data: ViatorSearchResult; renderCard: (tour: TourCandidate, key: string) => React.ReactNode }) {
  return (
    <section aria-label="Viator 판매 상품" className="space-y-2 border-t border-slate-100 pt-3">
      <h3 className="text-xs font-semibold text-slate-800">
        Viator 실제 판매 상품 · {data.destinationName}
        <span className="ml-1.5 font-normal text-slate-500">({data.tours.length}개, 평점·후기 순)</span>
      </h3>
      {data.tours.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">조건에 맞는 판매 상품이 없습니다. 투어 종류를 바꿔 보세요.</p>
      ) : (
        <ul className="space-y-2">{data.tours.map((tour) => renderCard(tour, tour.market?.productCode ?? tour.name))}</ul>
      )}
      {data.skipped.length > 0 && (
        <p className="text-[11px] text-amber-700">
          Viator 분류에서 찾지 못해 건너뛴 종류: {data.skipped.map((c) => TOUR_CATEGORIES.find((t) => t.id === c)?.label ?? c).join(", ")}
        </p>
      )}
      <p className="text-[10px] leading-4 text-slate-400">
        Viator가 판매하는 정가입니다. 우리가 직접 운영·구매하는 투어의 원가와는 다를 수 있어, &quot;선택 옵션&quot;에 넣으면 원가와 요금은 직접 조정하세요. 상품 링크에는 Viator
        제휴 추적이 포함되어 있습니다.
      </p>
    </section>
  );
}
