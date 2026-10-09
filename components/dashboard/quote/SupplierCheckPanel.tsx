"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { currencySymbol, formatMoney } from "@/lib/currency";
import type { PmChoice } from "@/lib/itinerary";
import { supplierAfterCuts, supplierCuts, supplierTarget } from "@/lib/supplierCheck";
import { quotePriceFor } from "@/lib/supplierQuote";
import { verifySupplierQuote } from "@/lib/supplierVerify";
import { SupplierVerifyTable } from "./SupplierVerifyTable";
import type { CourseMeta, DayPlan, QuoteData, SupplierQuote, TripInput } from "@/types";

interface Props {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  meta: CourseMeta | null;
  quote: QuoteData;
  /** 우리 조건으로 맞춘 경쟁 상품 가격의 하위 25% (경쟁 가격이 없으면 null) */
  competitorP25: number | null;
  competitorCount: number;
  onInputChange: (patch: Partial<TripInput>) => void;
  /** 우리 시세 조회 (자동 견적) */
  market: { run: () => void; running: boolean };
}

const ROOM_LABELS: Record<SupplierQuote["roomBasis"], string> = { twin: "2인 1실", single: "1인 1실", triple: "3인 1실", unknown: "객실 기준 안 적힘" };
const UNIT_LABELS: Record<SupplierQuote["lines"][number]["unit"], string> = {
  per_person: "1인",
  per_group: "팀당",
  per_day: "1일",
  per_room_night: "1실 1박",
  unknown: "",
};

/** 업체에서 받은 견적서에서 읽은 내용 */
function QuoteSummary({ q, input, money }: { q: SupplierQuote; input: TripInput; money: (v: number) => string }) {
  const orig = (v: number) => (q.rate === null ? `${v.toLocaleString("ko-KR")} ${q.originalCurrency}` : money(v));
  const { tier } = quotePriceFor(q, input.travelers);
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-[11px] leading-5 text-slate-700">
      <p>
        1인{" "}
        <span className="font-semibold tabular-nums text-slate-900">
          {q.originalPrice.toLocaleString("ko-KR")} {q.originalCurrency || input.currency}
        </span>
        {q.rate !== null && q.originalCurrency && q.originalCurrency !== input.currency && <> (≈ {money(q.pricePerPerson)})</>}
        {" · "}
        {q.basisTravelers > 0 ? `${q.basisTravelers}명 기준` : "인원 기준 안 적힘"} · {ROOM_LABELS[q.roomBasis]}
        {q.singleSupplement > 0 && <> · 싱글차지 {orig(q.singleSupplement)}</>}
      </p>
      {q.rate === null && (
        <p role="alert" className="flex items-start gap-1 text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          통화({q.originalCurrency || "모름"})를 {input.currency}로 바꾸지 못했습니다. 아래 업체 공급가에 직접 넣어 주세요.
        </p>
      )}
      {(q.roomBasis === "unknown" || q.basisTravelers === 0) && (
        <p className="text-amber-800">
          견적서에 {q.basisTravelers === 0 ? "몇 명 기준인지" : ""}
          {q.basisTravelers === 0 && q.roomBasis === "unknown" ? "와 " : ""}
          {q.roomBasis === "unknown" ? "객실 기준(2인 1실 등)" : ""}이 없습니다 — 업체에 확인하세요.
        </p>
      )}
      {q.tiers.length > 0 && (
        <p>
          인원별 요금: {q.tiers.map((t) => `${t.travelers}명 ${orig(t.pricePerPerson)}`).join(" · ")}
          {tier !== null && (
            <span className="text-slate-500">
              {" "}
              — 지금 {input.travelers}명이라 {tier}명 요금을 씁니다
            </span>
          )}
        </p>
      )}
      {q.lines.length > 0 && (
        <ul className="grid gap-x-4 sm:grid-cols-2">
          {q.lines.map((l, i) => (
            <li key={`${l.label}-${i}`} className="flex justify-between gap-2 tabular-nums">
              <span className="truncate">{l.label}</span>
              <span>
                {orig(l.amount)} {UNIT_LABELS[l.unit] && <span className="text-slate-400">/{UNIT_LABELS[l.unit]}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(q.includes.length > 0 || q.excludes.length > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-emerald-800">포함</p>
            <p className="text-pretty">{q.includes.join(", ") || "안 적힘"}</p>
          </div>
          <div>
            <p className="font-semibold text-red-700">불포함</p>
            <p className="text-pretty">{q.excludes.join(", ") || "안 적힘"}</p>
          </div>
        </div>
      )}
      {(q.shopping || q.options || q.notes) && (
        <p className="text-pretty text-slate-500">
          {[q.shopping && `쇼핑: ${q.shopping}`, q.options && `선택관광: ${q.options}`, q.notes].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

/** 업체 견적 검증 — 목표 판매가에서 업체 공급가 상한을 거꾸로 계산하고, 넘으면 업체에 빼 달라고 할 일정을 고른다 */
export function SupplierCheckPanel({ input, days, pmChoice, meta, quote, competitorP25, competitorCount, onInputChange, market }: Props) {
  const verify = verifySupplierQuote(input, days, pmChoice, quote);
  const money = (v: number) => formatMoney(Math.round(v), input.currency);
  const symbol = currencySymbol(input.currency);
  const target = supplierTarget(input, quote, competitorP25);
  const cuts = target ? supplierCuts(input, days, pmChoice, meta, target.over) : [];
  const selected = new Set(input.supplierCutIds ?? cuts.filter((c) => c.recommended).map((c) => c.id));
  const after = target ? supplierAfterCuts(target, cuts, selected) : null;
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onInputChange({ supplierCutIds: [...next] });
  };

  return (
    <div className="space-y-3">
      {input.supplierQuote ? (
        <QuoteSummary q={input.supplierQuote} input={input} money={money} />
      ) : (
        <p className="text-pretty text-[11px] text-slate-500">
          입력 화면의 &lsquo;업체 코스·견적&rsquo;에 업체 견적서(코스·요금)를 붙여넣거나 파일로 올리면 요금·포함·불포함을 읽어 여기에 보여 줍니다.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          id="supplierCheckPrice"
          label="업체 공급가 (1인, 2인 1실 기준)"
          value={input.supplierPricePerPerson}
          prefix={symbol}
          onChange={(supplierPricePerPerson) => onInputChange({ supplierPricePerPerson })}
        />
        <NumberField
          id="supplierTargetPrice"
          label="목표 판매가 (1인)"
          value={input.supplierTargetPrice}
          prefix={symbol}
          hint={
            input.supplierTargetPrice > 0
              ? "직접 넣은 판매가로 계산합니다. 0으로 두면 경쟁 상품 가격으로 정합니다."
              : competitorP25
                ? `0이면 경쟁 상품 ${competitorCount}개 가격(우리 조건으로 맞춘 값)의 낮은 쪽 25% 지점을 씁니다.`
                : "경쟁 상품이 없어 직접 넣어야 합니다."
          }
          onChange={(supplierTargetPrice) => onInputChange({ supplierTargetPrice })}
        />
      </div>

      <section aria-label="견적 검증표" className="space-y-1">
        <p className="text-[11px] font-semibold text-slate-700">견적 검증표 — 우리 시세와 비교 (업체 마진 30%까지는 적정으로 봅니다)</p>
        <SupplierVerifyTable verify={verify} currency={input.currency} market={market} />
      </section>

      {target ? (
        <>
          <div className="space-y-1 rounded-lg bg-slate-900 px-3 py-2.5 text-[11px] leading-5 text-slate-100" aria-label="업체 공급가 상한 계산">
            <div className="flex justify-between">
              <span>목표 판매가 {target.targetSource === "competitors" && <span className="text-slate-400">(경쟁 상품 하위 25%)</span>}</span>
              <span className="tabular-nums">{money(target.targetPrice)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>− 수수료 ({target.channelName})</span>
              <span className="tabular-nums">{money(target.feePerPerson)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>− 회사 수익 ({Math.round(target.marginRate * 100)}%)</span>
              <span className="tabular-nums">{money(target.profitPerPerson)}</span>
            </div>
            {target.otherPerPerson > 0 && (
              <div className="flex justify-between text-slate-300">
                <span>− 공급가 밖의 원가 (항공·팁·보험 등)</span>
                <span className="tabular-nums">{money(target.otherPerPerson)}</span>
              </div>
            )}
            {target.fxBufferRate > 0 && (
              <div className="flex justify-between text-slate-300">
                <span>− 환율 변동 버퍼 ({Math.round(target.fxBufferRate * 100)}%)</span>
                <span className="tabular-nums">반영</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-700 pt-1 font-semibold">
              <span>업체 공급가 상한 (1인, 2인 1실)</span>
              <span className="tabular-nums">{money(target.maxSupplierPerPerson)}</span>
            </div>
          </div>

          {target.over <= 0 ? (
            <p className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 ring-1 ring-emerald-200">
              <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden />
              지금 공급가 {money(target.supplierPerPerson)}는 상한 안입니다. 1인 {money(-target.over)}만큼 여유가 있습니다.
            </p>
          ) : (
            <p className="flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-[11px] text-red-800 ring-1 ring-red-200">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              지금 공급가 {money(target.supplierPerPerson)}는 상한보다 1인 <span className="font-semibold">{money(target.over)}</span> 높습니다 — 업체에
              공급가를 낮추거나 아래 일정을 빼 달라고 요청하세요.
            </p>
          )}

          {target.over > 0 && (
            <section aria-label="빼면 좋은 일정">
              <p className="mb-1 text-[11px] font-semibold text-slate-700">원가를 맞추려고 빼면 좋은 일정 (요금은 추정)</p>
              {cuts.length === 0 ? (
                <p className="text-[11px] text-slate-500">일정에 요금이 붙은 항목이 없습니다. 업체에 공급가 자체를 낮춰 달라고 요청하세요.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {cuts.slice(0, 10).map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-[11px] hover:bg-slate-50">
                        <input type="checkbox" className="mt-0.5" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                        <span className="flex-1">
                          <span className="font-medium text-slate-800">
                            DAY {c.dayNo} {c.name} {c.kind === "meal-down" ? "→ 보통 식사로" : "빼기"}
                          </span>
                          {c.recommended && <span className="ml-1 rounded bg-indigo-50 px-1 py-0.5 text-[10px] font-semibold text-indigo-700">추천</span>}
                          <span className="block text-slate-500">{c.reason}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-emerald-700">−{money(c.savingPerPerson)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {after && cuts.length > 0 && (
                <p className={`mt-2 text-pretty text-[11px] ${after.reaches ? "text-emerald-700" : "text-amber-700"}`} role="status">
                  고른 {selected.size}개를 빼면 예상 공급가 1인 {money(after.after)} (−{money(after.saving)}) —{" "}
                  {after.reaches
                    ? "상한 안으로 들어옵니다."
                    : `상한까지 아직 ${money(after.after - target.maxSupplierPerPerson)} 남습니다. 공급가 조정도 함께 요청하세요.`}
                </p>
              )}
            </section>
          )}
        </>
      ) : (
        <p className="text-[11px] text-slate-500">목표 판매가를 넣거나 경쟁 상품을 찾으면 업체 공급가 상한을 계산합니다.</p>
      )}
    </div>
  );
}
