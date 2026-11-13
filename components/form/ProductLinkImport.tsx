"use client";

import { Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { postJson } from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { flightFromImport, importPatch, reverseBudget } from "@/lib/productImport";
import type { ProductImportResponse } from "@/lib/schemas/productImport";
import type { TripInput } from "@/types";

/**
 * 다른 여행사 상품 링크(네이버 패키지·여행사 상세 등)로 코스를 만들고 판매가를 역계산한다.
 * [그대로 가져오기] 그 상품 코스를 업체 코스로 / [기준으로 우리 코스] 같은 기간·항공·주요 방문지로 우리 코스.
 */
export function ProductLinkImport({ input, onApply }: { input: TripInput; onApply: (patch: Partial<TripInput>, generate: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<{ status: "idle" | "loading" | "error"; message?: string }>({ status: "idle" });
  const [r, setR] = useState<ProductImportResponse | null>(null);
  const money = (v: number) => formatMoney(v, input.currency);

  const load = async () => {
    setState({ status: "loading" });
    setR(null);
    try {
      setR(await postJson<ProductImportResponse>("/api/import-product", { url: url.trim(), currency: input.currency }));
      setState({ status: "idle" });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "읽지 못했습니다." });
    }
  };
  const flight = r ? flightFromImport(r) : null;

  return (
    <section aria-label="상품 링크로 만들기" className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 text-xs">
      <p className="inline-flex items-center gap-1.5 font-semibold text-indigo-900">
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        상품 링크로 코스 만들기 · 판매가 역계산
      </p>
      <div className="flex gap-1.5">
        <input
          aria-label="상품 링크"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="예) https://pkgtour.naver.com/products/..."
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={state.status === "loading" || !/^https?:\/\/\S+\.\S+/.test(url.trim())}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
        >
          {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          읽기
        </button>
      </div>
      {state.status === "loading" && <p className="text-slate-500">상품 페이지를 읽는 중입니다 (30초~1분)…</p>}
      {state.status === "error" && (
        <p role="alert" className="text-rose-700">
          {state.message}
        </p>
      )}
      {r && !r.found && (
        <p role="alert" className="text-amber-800">
          상품 상세(일정·가격)를 읽지 못했습니다. 상세 페이지 글을 복사해 &quot;업체 코스 붙여넣기&quot;에 넣어 주세요.
        </p>
      )}
      {r && r.found && (
        <div className="space-y-1.5 rounded-lg bg-white p-2.5">
          <p className="font-semibold text-slate-900">
            {r.agency && <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">{r.agency}</span>}
            {r.productName}
          </p>
          <p className="text-slate-600">
            {r.destination} · {r.nights}박 {r.days}일{r.departureDate ? ` · ${r.departureDate} 출발` : ""}
          </p>
          {r.pricePerPerson > 0 && (
            <p>
              판매가 1인 <b>{money(r.pricePerPerson)}</b>
              {r.priceNote && <span className="text-slate-500"> ({r.priceNote})</span>}
              <span className="block text-slate-600">
                역계산 — 목표 마진 {input.targetMarginRate}%·수수료 {input.cardFeeRate}%를 빼면 1인 원가 예산 <b>{money(reverseBudget(r.pricePerPerson, input))}</b> (항공·숙박·지상비로 나눠 견적에서 보여 줍니다)
              </span>
            </p>
          )}
          {flight ? (
            <p className="text-slate-600">
              항공 {flight.airline} {flight.flightNumber} {flight.departTime}→{flight.arriveTime} / {flight.returnFlightNumber} {flight.returnDepartTime}→{flight.returnArriveTime}
            </p>
          ) : (
            <p className="text-slate-500">항공 시각을 읽지 못했습니다 (노선 기준 예상 시각으로 만듭니다).</p>
          )}
          {r.mustSee.length > 0 && <p className="text-slate-600">주요 방문지: {r.mustSee.join(", ")}</p>}
          {(r.shopping > 0 || r.optionTours.length > 0 || r.guideFee) && (
            <p className="text-slate-500">
              {r.shopping > 0 ? `쇼핑 ${r.shopping}회 · ` : ""}
              {r.optionTours.length > 0 ? `선택관광 ${r.optionTours.length}개 · ` : ""}
              {r.guideFee}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => onApply(importPatch(r, input, "ours"), true)}
              className="rounded-md bg-indigo-600 px-2.5 py-1.5 font-semibold text-white hover:bg-indigo-700"
            >
              이 상품 기준으로 우리 코스 만들기
            </button>
            <button
              type="button"
              disabled={r.courseText.trim().length < 20}
              onClick={() => onApply(importPatch(r, input, "copy"), true)}
              className="rounded-md border border-indigo-300 bg-white px-2.5 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              이 상품 코스 그대로 가져오기
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            둘 다 판매가를 &quot;판매가에서 시작&quot;으로 넣어 원가 예산을 역계산하고, 이 상품을 경쟁 상품으로 등록합니다. {r.readDirect ? "" : "(페이지를 직접 읽지 못해 AI가 링크·검색으로 읽었습니다 — 내용을 한 번 확인하세요.)"}
          </p>
        </div>
      )}
    </section>
  );
}
