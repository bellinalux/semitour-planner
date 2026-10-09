"use client";

import { Columns3, Download, ExternalLink, Loader2, X } from "lucide-react";
import { useRef } from "react";
import { useCompetitorItineraries } from "@/hooks/useCompetitorItineraries";
import { formatMoney } from "@/lib/currency";
import type { PmChoice } from "@/lib/itinerary";
import { buildProductCompare, productCompareCsv, type CompareProduct, type PlaceMark } from "@/lib/productCompare";
import type { CourseMeta, DayPlan, QuoteData, TourPolicy, TripInput } from "@/types";

interface Props {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteData;
  meta: CourseMeta | null;
  onInputChange: (patch: Partial<TripInput>) => void;
}

const MARK_TONE: Record<"ours" | "theirs", Record<PlaceMark, string>> = {
  ours: { shared: "bg-indigo-50 text-indigo-800 ring-indigo-200", only: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  theirs: { shared: "bg-indigo-50 text-indigo-800 ring-indigo-200", only: "bg-amber-50 text-amber-800 ring-amber-200" },
};
const policy = (p: TourPolicy) => (p === "none" ? "없음" : p === "some" ? "있음" : "모름");

function Chips({ product, places }: { product: CompareProduct; places: { name: string; mark: PlaceMark }[] }) {
  const tone = MARK_TONE[product.isOurs ? "ours" : "theirs"];
  return (
    <span className="flex flex-wrap gap-1">
      {places.map((p, i) => (
        <span key={`${p.name}-${i}`} className={`rounded px-1.5 py-0.5 text-[10.5px] ring-1 ${tone[p.mark]}`}>
          {p.name}
        </span>
      ))}
    </span>
  );
}

/**
 * 상품 비교 보기 — 투어 비교표의 경쟁 상품들을 한 화면에서 우리 상품과 견준다.
 * ① 금액·조건(표시 가격 → 같은 조건 가격 → 차이) ② 날짜별 코스(같은 곳·우리만·그 상품만) ③ 상품별 나은 점·가격 차이 이유. 엑셀(CSV)로 저장할 수 있다.
 */
export function ProductCompareDialog({ input, days, pmChoice, quote, meta, onInputChange }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const itineraries = useCompetitorItineraries(input, onInputChange);
  const cmp = buildProductCompare(input, days, pmChoice, quote, meta);
  if (!cmp) return null;
  const money = (v: number | null) => (v === null ? "모름" : formatMoney(Math.round(v), input.currency));
  const close = () => dialogRef.current?.close();
  const download = () => {
    const blob = new Blob([productCompareCsv(cmp)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `상품비교_${input.destination.trim() || "여행"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const rows: { label: string; cell: (p: CompareProduct) => React.ReactNode }[] = [
    { label: "표시 가격", cell: (p) => money(p.listedPrice) },
    { label: "같은 조건으로 맞춤", cell: (p) => (p.isOurs ? "기준" : p.adjustNote || "조정 없음") },
    { label: "같은 조건 1인가", cell: (p) => <b className="text-slate-900">{money(p.scopedPrice)}</b> },
    {
      label: "우리와 차이",
      cell: (p) =>
        p.isOurs ? (
          "—"
        ) : p.diff === null ? (
          "모름"
        ) : (
          <span className={p.diff > 0 ? "font-semibold text-emerald-700" : p.diff < 0 ? "font-semibold text-red-600" : ""}>
            {p.diff > 0 ? `우리가 ${money(p.diff)} 저렴` : p.diff < 0 ? `우리가 ${money(-p.diff)} 비쌈` : "같음"}
          </span>
        ),
    },
    { label: "일정", cell: (p) => p.span || "모름" },
    { label: "호텔", cell: (p) => p.hotel || "모름" },
    { label: "식사 포함(조식 제외)", cell: (p) => (p.mealCount === null ? "일정 가져오면 표시" : `${p.mealCount}회`) },
    { label: "자유일", cell: (p) => (p.freeDays === null ? "일정 가져오면 표시" : `${p.freeDays}일`) },
    { label: "쇼핑 / 선택관광", cell: (p) => `${policy(p.shopping)} / ${policy(p.optionTour)}` },
    { label: "가이드 경비(팁)", cell: (p) => p.tipNote || "—" },
    { label: "다른 지역", cell: (p) => (p.otherRegions.length > 0 ? <span className="text-amber-700">{p.otherRegions.join("·")} 포함</span> : "—") },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
      >
        <Columns3 className="size-3.5" aria-hidden />
        상품 비교 보기 (코스·금액 한눈에)
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="product-compare-title"
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto w-[calc(100%-1rem)] max-w-6xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[90dvh] flex-col">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <h2 id="product-compare-title" className="flex-1 text-sm font-semibold text-slate-900">
              상품 비교 — 우리 vs 경쟁 상품 {cmp.products.length - 1}개
            </h2>
            {itineraries.pending > 0 && (
              <button
                type="button"
                onClick={itineraries.run}
                disabled={itineraries.running.length > 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
              >
                {itineraries.running.length > 0 && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                {itineraries.running.length > 0 ? `일정 읽는 중… (${itineraries.pending}개 남음)` : `경쟁 상품 일정 가져오기 (${itineraries.pending}개)`}
              </button>
            )}
            <button type="button" onClick={download} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="size-3.5" aria-hidden />
              엑셀(CSV) 저장
            </button>
            <button type="button" onClick={close} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="space-y-5 overflow-y-auto p-4 text-[11px] leading-4">
            <p className="text-pretty rounded-md bg-slate-50 px-3 py-2 font-semibold text-slate-800 ring-1 ring-slate-200">{cmp.conclusion}</p>
            {itineraries.message && (
              <p role="status" className="text-pretty text-indigo-800">
                {itineraries.message}
              </p>
            )}

            <section aria-label="금액·조건">
              <h3 className="mb-1.5 text-xs font-semibold text-slate-800">① 금액·조건</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th scope="col" className="w-32 px-2 py-1.5 font-medium text-slate-500">
                        항목
                      </th>
                      {cmp.products.map((p) => (
                        <th key={p.id} scope="col" className={`px-2 py-1.5 align-top font-semibold ${p.isOurs ? "bg-indigo-50 text-indigo-900" : "text-slate-800"}`}>
                          <span className="line-clamp-2">{p.name}</span>
                          {p.link && (
                            <a href={p.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[10px] font-normal text-slate-500 underline">
                              판매 페이지 <ExternalLink className="size-2.5" aria-hidden />
                            </a>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums text-slate-700">
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <th scope="row" className="px-2 py-1.5 text-left align-top font-medium text-slate-500">
                          {r.label}
                        </th>
                        {cmp.products.map((p) => (
                          <td key={p.id} className={`px-2 py-1.5 align-top ${p.isOurs ? "bg-indigo-50/40" : ""}`}>
                            {r.cell(p)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-label="날짜별 코스">
              <h3 className="mb-1.5 text-xs font-semibold text-slate-800">② 날짜별 코스</h3>
              <p className="mb-1.5 flex flex-wrap gap-2 text-[10.5px] text-slate-500">
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-800 ring-1 ring-indigo-200">같은 곳</span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 ring-1 ring-emerald-200">우리만</span>
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 ring-1 ring-amber-200">그 상품만</span>
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th scope="col" className="w-36 px-2 py-1.5 font-medium text-slate-500">
                        상품
                      </th>
                      {Array.from({ length: cmp.maxDays }, (_, i) => (
                        <th key={i} scope="col" className="px-2 py-1.5 font-semibold text-slate-700">
                          DAY {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cmp.products.map((p) => (
                      <tr key={p.id} className={p.isOurs ? "bg-indigo-50/30" : ""}>
                        <th scope="row" className="px-2 py-1.5 text-left align-top font-semibold text-slate-800">
                          <span className="line-clamp-2">{p.name}</span>
                        </th>
                        {p.days ? (
                          Array.from({ length: cmp.maxDays }, (_, i) => {
                            const d = p.days!.find((x) => x.day === i + 1);
                            return (
                              <td key={i} className="min-w-28 px-2 py-1.5 align-top">
                                {d && (
                                  <span className="space-y-1">
                                    {(d.free || d.otherRegion) && (
                                      <span className="flex flex-wrap gap-1">
                                        {d.free && <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">자유일정</span>}
                                        {d.otherRegion && <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{d.otherRegion}</span>}
                                      </span>
                                    )}
                                    <Chips product={p} places={d.places} />
                                    <span className="block text-[10px] text-slate-500">
                                      중 {d.meals.lunch || "—"} · 석 {d.meals.dinner || "—"}
                                    </span>
                                  </span>
                                )}
                              </td>
                            );
                          })
                        ) : (
                          <td colSpan={cmp.maxDays} className="px-2 py-1.5 align-top">
                            <span className="mb-1 block text-slate-500">
                              {p.itineraryState === "missing" ? "판매 페이지에서 일정표를 찾지 못했습니다 — 주요 방문지:" : "날짜별 일정을 아직 가져오지 않았습니다 — 주요 방문지:"}
                            </span>
                            {p.places.length > 0 ? <Chips product={p} places={p.places} /> : <span className="text-slate-400">모름</span>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-label="상품별 정리">
              <h3 className="mb-1.5 text-xs font-semibold text-slate-800">③ 상품별 정리</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {cmp.products
                  .filter((p) => !p.isOurs)
                  .map((p) => (
                    <div key={p.id} className="rounded-lg border border-slate-200 p-2.5">
                      <p className="line-clamp-1 font-semibold text-slate-900">{p.name}</p>
                      <p className="mt-1 text-emerald-800">
                        <b>우리가 나은 점</b> {p.ourBetter.join(", ") || "—"}
                      </p>
                      <p className="mt-0.5 text-amber-800">
                        <b>그 상품이 나은 점</b> {p.theirBetter.join(", ") || "—"}
                      </p>
                      <p className="mt-0.5 text-pretty text-slate-600">
                        <b>가격</b> {p.priceReason}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        </div>
      </dialog>
    </>
  );
}
