import { analyzeCompetitors, ourPolicy, POLICY_LABELS } from "@/lib/competitorDiff";
import { formatMoney } from "@/lib/currency";
import { tripPeriod } from "@/lib/documents";
import { localPayRows } from "@/lib/fees";
import { simulateOptions } from "@/lib/options";
import { buildPriceTiers, composition, fxSensitivity, singleSupplement } from "@/lib/pricing";
import { DocFacts, DocSection, DocShell, type DocProps } from "./DocShell";
import { priceLabel } from "@/lib/channels";

/**
 * 내부용 원가·마진 검토서. 고객용 문서에는 넣지 않는 원가 내역, 마진, 경쟁사 분석을 모두 담는다.
 * 고객에게 전달하면 안 되는 문서라 머리말에 크게 표시한다.
 */
export function InternalQuoteDoc({ input, days, pmChoice, quote: documentQuote, rawQuote, meta, company }: DocProps) {
  // 내부 검토서는 채널·수수료·마진이 모두 들어 있는 원래 견적으로 만든다
  const quote = rawQuote ?? documentQuote;
  const money = (v: number) => formatMoney(v, input.currency);
  const s = quote.scenario;
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const localPay = localPayRows(days, pmChoice);
  const policy = ourPolicy(days, pmChoice, input, meta);
  const sim = simulateOptions(input.options, quote.travelers, input.cardFeeRate);
  const tiers = buildPriceTiers(quote, input, policy);
  const single = singleSupplement(quote, input);
  const comp = composition(quote, input);
  const fx = fxSensitivity(quote, input);
  const diffs = analyzeCompetitors(
    input.competitors.filter((c) => c.price > 0),
    quote,
    input,
    policy,
  );

  return (
    <DocShell title="원가·마진 검토서 (내부용)" subtitle={title} company={company}>
      <p className="break-inside-avoid border-2 border-red-600 bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-700">
        내부 검토용 문서입니다. 원가와 마진이 들어 있으므로 고객에게 전달하지 마세요.
      </p>

      <DocSection title="상품 개요">
        <DocFacts
          rows={[
            { label: "상품명", value: title },
            { label: "여행기간", value: `${tripPeriod(input)} (${input.nights}박 ${input.days}일)` },
            { label: "기준 인원", value: `${quote.travelers}명` },
            { label: "차량·가이드 일수", value: `${quote.groundDays}일` },
            { label: "쇼핑 · 선택관광", value: `쇼핑 ${POLICY_LABELS[policy.shopping]} · 옵션 ${POLICY_LABELS[policy.optionTour]}` },
          ]}
        />
      </DocSection>

      <DocSection title="원가 내역">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-2 py-1.5 font-medium">항목</th>
              <th className="px-2 py-1.5 font-medium">산정 근거</th>
              <th className="px-2 py-1.5 text-right font-medium">금액</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines
              .filter((line) => line.amount > 0)
              .map((line) => (
                <tr key={line.key} className="border-b border-slate-200">
                  <td className="px-2 py-1">
                    {line.label}
                    {line.excluded && <span className="ml-1 text-[10px] text-amber-700">[미정·제외]</span>}
                    {!line.excluded && line.status === "estimated" && <span className="ml-1 text-[10px] text-slate-500">[추정]</span>}
                  </td>
                  <td className="px-2 py-1 text-slate-500">{line.note ?? ""}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(line.amount)}</td>
                </tr>
              ))}
            <tr className="border-b border-slate-300 font-semibold">
              <td className="px-2 py-1.5" colSpan={2}>
                총 원가 (1인 {money(s.costPerPerson)})
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(s.baseCost)}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="px-2 py-1" colSpan={2}>
                카드 수수료
              </td>
              <td className="px-2 py-1 text-right tabular-nums">{money(s.cardFee)}</td>
            </tr>
            <tr className="border-b-2 border-slate-800 bg-slate-50 font-bold">
              <td className="px-2 py-1.5" colSpan={2}>
                예상 이익 (마진율 {s.actualMarginRate.toFixed(1)}%)
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(s.profit)}</td>
            </tr>
            <tr className="font-bold">
              <td className="px-2 py-1.5" colSpan={2}>
                {priceLabel(quote.pricingMode)} · {money(s.pricePerPerson)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(s.totalPrice)}</td>
            </tr>
          </tbody>
        </table>
        {quote.withUndecided && (
          <p className="mt-1 text-[10px] text-amber-700">
            미정 항목({quote.undecidedLabels.join(", ")}) 포함 시 — 총 원가 {money(quote.withUndecided.baseCost)} · 1인{" "}
            {money(quote.withUndecided.pricePerPerson)} · 이익률 {quote.withUndecided.actualMarginRate.toFixed(1)}%
          </p>
        )}
      </DocSection>

      <DocSection title="추천 판매가 (최저 · 권장 · 경쟁력)">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-2 py-1.5 font-medium">구분</th>
              <th className="px-2 py-1.5 text-right font-medium">1인 판매가</th>
              <th className="px-2 py-1.5 text-right font-medium">이익률</th>
              <th className="px-2 py-1.5 font-medium">기준</th>
            </tr>
          </thead>
          <tbody>
            {tiers.tiers.map((t) => (
              <tr key={t.key} className="border-b border-slate-200">
                <td className="px-2 py-1">{t.label}</td>
                <td className="px-2 py-1 text-right tabular-nums">{t.price === null ? "-" : money(t.price)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{t.marginRate === null ? "-" : `${t.marginRate.toFixed(1)}%`}</td>
                <td className="px-2 py-1 text-slate-500">{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tiers.position && <p className="mt-1 text-slate-600">{tiers.position}</p>}
        <p className="mt-0.5 text-[10px] text-slate-500">계산 기준 채널: {tiers.basisName}</p>
      </DocSection>

      {quote.channels.length > 1 && (
        <DocSection title="판매 채널별 정산">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 text-left">
                <th className="px-2 py-1.5 font-medium">채널</th>
                <th className="px-2 py-1.5 text-right font-medium">고객가(1인)</th>
                <th className="px-2 py-1.5 text-right font-medium">수수료</th>
                <th className="px-2 py-1.5 text-right font-medium">정산액</th>
                <th className="px-2 py-1.5 text-right font-medium">이익</th>
                <th className="px-2 py-1.5 text-right font-medium">이익률</th>
                <th className="px-2 py-1.5 text-right font-medium">손익분기</th>
              </tr>
            </thead>
            <tbody>
              {quote.channels.map((c) => (
                <tr key={c.id} className="border-b border-slate-200">
                  <td className="px-2 py-1">{c.name}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(c.pricePerPerson)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {c.feeRate.toFixed(1)}%{c.fixedFeePerPerson > 0 ? ` + ${money(c.fixedFeePerPerson)}/인` : ""}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(c.settlement)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(c.profit)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{c.marginRate.toFixed(1)}%</td>
                  <td className="px-2 py-1 text-right tabular-nums">{c.breakEvenTravelers === null ? "불가" : `${c.breakEvenTravelers}명`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocSection>
      )}

      {(single || comp || fx) && (
        <DocSection title="요금 구성 · 환율 민감도">
          {single && (
            <p>
              1인실 사용 시 추가요금 권장 {money(single.price)} (한 방 {single.guestsPerUnit}명 기준, 원가 {money(single.cost)})
            </p>
          )}
          {comp && (
            <p>
              성인 {comp.adults}명 {money(comp.adultPrice)}
              {comp.children > 0 ? ` · 아동 ${comp.children}명 ${money(comp.childPrice)}` : ""}
              {comp.infants > 0 ? ` · 유아 ${comp.infants}명 ${money(comp.infantPrice)}` : ""} → 총 {money(comp.revenue)}, 예상 이익 {money(comp.profit)} (
              {comp.marginRate.toFixed(1)}%)
            </p>
          )}
          {fx && (
            <p>
              환율 {fx.breakEvenShift.toFixed(1)}% 상승 시 이익 0, {fx.targetShift.toFixed(1)}% 상승 시 목표 마진 미달 (원화 판매가 고정 가정)
            </p>
          )}
        </DocSection>
      )}

      <DocSection title="인원별 단가">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-2 py-1.5 font-medium">인원</th>
              <th className="px-2 py-1.5 text-right font-medium">1인 원가</th>
              <th className="px-2 py-1.5 text-right font-medium">1인 판매가</th>
              <th className="px-2 py-1.5 text-right font-medium">이익률</th>
            </tr>
          </thead>
          <tbody>
            {quote.matrix.map((row) => (
              <tr key={row.travelers} className={`border-b border-slate-200 ${row.travelers === quote.travelers ? "bg-slate-50 font-semibold" : ""}`}>
                <td className="px-2 py-1">{row.travelers}명</td>
                <td className="px-2 py-1 text-right tabular-nums">{money(row.costPerPerson)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{money(row.pricePerPerson)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{row.actualMarginRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-slate-600">
          손익분기 최소 인원 {quote.breakEvenTravelers === null ? "달성 불가" : `${quote.breakEvenTravelers}명`} · 목표 마진{" "}
          {input.targetMarginRate}% 달성 최소 인원 {quote.targetMarginTravelers === null ? "달성 불가" : `${quote.targetMarginTravelers}명`}
          {input.minTravelers > 0 ? ` · 최저 행사인원 ${input.minTravelers}명` : ""}
        </p>
      </DocSection>

      {input.options.length > 0 && (
        <DocSection title="선택 옵션 손익">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 text-left">
                <th className="px-2 py-1.5 font-medium">옵션</th>
                <th className="px-2 py-1.5 text-right font-medium">원가</th>
                <th className="px-2 py-1.5 text-right font-medium">요금</th>
                <th className="px-2 py-1.5 text-right font-medium">예상 신청</th>
                <th className="px-2 py-1.5 text-right font-medium">이익</th>
              </tr>
            </thead>
            <tbody>
              {sim.rows.map(({ option, participants, runs, profit }) => (
                <tr key={option.id} className="border-b border-slate-200">
                  <td className="px-2 py-1">
                    {option.name}
                    {option.dayNo > 0 && <span className="text-slate-500"> (DAY {option.dayNo})</span>}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(option.costPerPerson)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(option.pricePerPerson)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{participants}명</td>
                  <td className="px-2 py-1 text-right tabular-nums">{runs ? money(profit) : "미진행"}</td>
                </tr>
              ))}
              <tr className="border-b-2 border-slate-800 bg-slate-50 font-semibold">
                <td className="px-2 py-1.5" colSpan={4}>
                  옵션 이익 합계 ({sim.marginRate.toFixed(1)}%)
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(sim.profit)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 font-semibold">
            기본 상품 이익 {money(s.profit)} + 옵션 이익 {money(sim.profit)} = {money(s.profit + sim.profit)}
          </p>
        </DocSection>
      )}

      {localPay.rows.length > 0 && (
        <DocSection title="현지 지불 항목 (원가·판매가에서 제외)">
          <ul>
            {localPay.rows.map((row) => (
              <li key={`${row.day}-${row.name}`}>
                · DAY {row.day} {row.name} — {row.amount > 0 ? money(row.amount) : "금액 미입력"}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-slate-600">1인 합계 {money(localPay.perPerson)}</p>
        </DocSection>
      )}

      {diffs.length > 0 && (
        <DocSection title="경쟁사 가격 차이 분석">
          <div className="space-y-2">
            {diffs.map((d) => {
              const name = d.competitor.name.trim() || "경쟁사";
              const verdict =
                d.adjustedDiff === null
                  ? "비교 불가"
                  : d.adjustedDiff < 0
                    ? `우리가 ${money(-d.adjustedDiff)} 비쌈`
                    : `우리가 ${money(d.adjustedDiff)} 저렴`;
              return (
                <div key={d.competitor.id} className="break-inside-avoid border border-slate-200 px-2 py-1.5">
                  <p className="font-semibold">
                    {name} — {money(d.competitor.price)} · {verdict}
                  </p>
                  {d.adjustments.length > 0 && (
                    <p className="text-slate-500">
                      같은 조건으로 맞춤({input.compareBasis === "land" ? "랜드 기준" : "총액 기준"}): 우리 {money(s.pricePerPerson)}
                      {d.adjustments
                        .filter((a) => a.side === "ours")
                        .map((a) => ` ${a.amount >= 0 ? "+" : "-"} ${a.label} ${money(Math.abs(a.amount))}`)
                        .join("")}{" "}
                      = {money(d.adjustedOurPrice)} / 경쟁사 {money(d.competitor.price)}
                      {d.adjustments
                        .filter((a) => a.side === "theirs")
                        .map((a) => ` ${a.amount >= 0 ? "+" : "-"} ${a.label} ${money(Math.abs(a.amount))}`)
                        .join("")}{" "}
                      = {money(d.adjustedCompetitorPrice)}
                    </p>
                  )}
                  <p className="text-slate-500">
                    쇼핑 {POLICY_LABELS[d.competitor.shopping]} · 옵션 {POLICY_LABELS[d.competitor.optionTour]}
                  </p>
                  <ul className="mt-0.5">
                    {d.reasons.map((r) => (
                      <li key={r.text}>
                        {r.kind === "premium" ? "▲" : r.kind === "gap" ? "▼" : "·"} {r.text}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </DocSection>
      )}
    </DocShell>
  );
}
