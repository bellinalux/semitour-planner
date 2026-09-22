"use client";

import { AlertTriangle, Check, ExternalLink, Info, Loader2, Plus, Search } from "lucide-react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useRequest } from "@/hooks/useRequest";
import { candidateToCompetitor, isAlreadyAdded } from "@/lib/competitors";
import { formatMoney } from "@/lib/currency";
import { MAX_COMPETITORS } from "@/lib/defaults";
import type { CompetitorCandidate, CompetitorIncludes, SearchSource } from "@/types";
import type { SectionProps } from "./types";

interface Result {
  products: CompetitorCandidate[];
  sources: SearchSource[];
  searched: boolean;
  searchedAt: string;
}

const INCLUDE_LABELS: { key: keyof CompetitorIncludes; label: string }[] = [
  { key: "flight", label: "항공" },
  { key: "hotel", label: "숙박" },
  { key: "meals", label: "식사" },
  { key: "vehicle", label: "차량" },
  { key: "guide", label: "가이드" },
  { key: "admission", label: "입장료" },
];

/** 하나투어·모두투어 등 대형 여행사의 비슷한 상품을 웹에서 찾아 경쟁사 목록에 넣는다 */
export function CompetitorFinder({ input, onChange }: SectionProps) {
  const { state, data, run } = useRequest<
    { destination: string; nights: number; days: number; currency: string; packageType: string; originCity: string },
    Result
  >("/api/find-competitors");

  const canRun = input.destination.trim() !== "";
  const full = input.competitors.length >= MAX_COMPETITORS;

  const search = () =>
    run({
      destination: input.destination.trim(),
      nights: input.nights,
      days: input.days,
      currency: input.currency,
      packageType: input.packageType,
      originCity: input.originCity.trim(),
    });

  const add = (candidate: CompetitorCandidate) => {
    if (full) return;
    onChange({ competitors: [...input.competitors, candidateToCompetitor(candidate, data?.searchedAt ?? new Date().toISOString())] });
  };

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={search}
          disabled={!canRun || state.status === "loading"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          {state.status === "loading" ? "경쟁사 조사 중..." : "대형 여행사 상품 찾기"}
        </button>
        {!canRun && <span className="text-[11px] text-slate-500">여행지를 먼저 입력하세요.</span>}
      </div>
      <p className="text-[11px] leading-4 text-slate-500">
        하나투어·모두투어·노랑풍선·참좋은여행 등에서 비슷한 기간의 상품을 검색해 요금과 포함 내역을 가져옵니다. 1분 정도 걸릴 수 있어요.
      </p>

      {state.status === "error" && (
        <ErrorBanner title="경쟁사를 찾지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={search} />
      )}

      {state.status === "success" && data && (
        <div className="space-y-2">
          {!data.searched && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              웹 검색 근거를 확보하지 못했습니다. AI 기억에 의존한 참고 정보라서 상품명과 요금을 반드시 직접 확인하세요.
            </p>
          )}
          <p className="flex items-start gap-1.5 rounded-md bg-slate-50 px-2.5 py-2 text-[11px] leading-4 text-slate-500">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            요금은 검색 시점의 대표 출발일 기준이며, 유류할증료·제세공과금이 빠져 있을 수 있습니다. 비교표에 넣기 전에 판매 페이지에서 확인하세요.
          </p>

          {data.products.length === 0 ? (
            <p className="rounded-md bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">비슷한 상품을 찾지 못했습니다.</p>
          ) : (
            <ul className="space-y-2">
              {data.products.map((product) => {
                const added = isAlreadyAdded(input.competitors, product);
                const includes = INCLUDE_LABELS.filter(({ key }) => product.includes[key]).map(({ label }) => label);
                return (
                  <li key={`${product.agency}-${product.productName}`} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {product.agency && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{product.agency}</span>
                      )}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          product.basis === "searched" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                        title={product.basis === "searched" ? "판매 페이지에서 확인한 요금" : "AI 추정"}
                      >
                        {product.basis === "searched" ? "검색 확인" : "추정"}
                      </span>
                      {product.noShopping && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">노쇼핑</span>}
                      {product.noOption && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">노옵션</span>}
                    </div>
                    <p className="mt-1.5 text-sm font-semibold leading-5 text-slate-900">{product.productName || "상품명 미확인"}</p>

                    <div className="mt-1.5 space-y-1 text-[11px] leading-4 text-slate-600">
                      <p>
                        <span className="font-semibold tabular-nums text-slate-900">
                          {product.pricePerPerson > 0 ? `1인 ${formatMoney(product.pricePerPerson, input.currency)}` : "요금 미확인"}
                        </span>
                        {product.nights > 0 && product.days > 0 && <span> · {product.nights}박 {product.days}일</span>}
                        {product.hotelGrade && <span> · {product.hotelGrade}</span>}
                      </p>
                      {includes.length > 0 && (
                        <p>
                          <span className="font-medium text-slate-700">포함</span> {includes.join(", ")}
                        </p>
                      )}
                      {product.highlight && <p className="text-slate-500">{product.highlight}</p>}
                      {product.priceNote && <p className="text-amber-700">{product.priceNote}</p>}
                      {product.sourceName && <p className="text-slate-400">확인 출처: {product.sourceName}</p>}
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        onClick={() => add(product)}
                        disabled={added || full}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {added ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                        {added ? "추가됨" : "경쟁사로 추가"}
                      </button>
                      <a
                        href={product.searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                      >
                        판매 페이지 검색
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {full && <p className="text-[11px] text-amber-700">경쟁사는 최대 {MAX_COMPETITORS}개까지 등록할 수 있습니다.</p>}

          {data.sources.length > 0 && (
            <details className="rounded-md bg-white p-2.5 ring-1 ring-slate-200">
              <summary className="cursor-pointer text-[11px] font-medium text-slate-600">참고한 출처 ({data.sources.length})</summary>
              <ul className="mt-1.5 space-y-0.5">
                {data.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-600 hover:underline">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
