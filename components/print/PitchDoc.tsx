import { ourPolicy } from "@/lib/competitorDiff";
import { dayMeals, includeLists, tripPeriod } from "@/lib/documents";
import { localPayRows, moneyWithKrw } from "@/lib/fees";
import { gradeText } from "@/lib/itemTypes";
import { dayItems } from "@/lib/itinerary";
import { buildTourCompare } from "@/lib/tourCompare";
import { DocCover, DocSection, DocShell, type DocProps } from "./DocShell";

const SKIP = new Set(["meal", "transfer", "hotel", "flight", "free_time"]);

/**
 * 고객용 상품 소개서 ("왜 이 상품인가") — 이 상품의 좋은 점(노쇼핑·노옵션·포함 식사·호텔·방문지), 포함 사항, 날짜별 하이라이트,
 * 그리고 여행 상품을 고를 때 확인할 점(업계·소비자 안내 기준)을 한 장에 담는다.
 * 경쟁사 이름·우리 원가·수익은 넣지 않는다 — 비교 결과는 "대형 여행사 같은 조건 상품" 같은 일반 표현으로만.
 */
export function PitchDoc({ input, days, pmChoice, quote, meta, company }: DocProps) {
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const money = (v: number) => moneyWithKrw(v, input.currency, input.exchangeRateToKrw);
  const policy = ourPolicy(days, pmChoice, input, meta);
  const localPay = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, localPay.rows.length > 0);
  const mealCount = days.reduce((s, _d, i) => {
    const m = dayMeals(days, i, pmChoice, input);
    return s + (m.lunch.mark !== "불포함" ? 1 : 0) + (m.dinner.mark !== "불포함" ? 1 : 0);
  }, 0);
  const placeCount = new Set(days.flatMap((d) => dayItems(d, pmChoice).filter((i) => !SKIP.has(i.type ?? "sightseeing")).map((i) => i.name.trim()))).size;
  const hotel = input.packageType === "land" ? "" : input.lodgingType === "resort" ? "리조트" : gradeText(input.hotelGrade);

  // 이 상품의 좋은 점 — 확실한 것부터 (정책·포함), 경쟁 비교에서 나온 강점은 일반 표현으로
  const points: string[] = [];
  if (policy.shopping === "none") points.push("쇼핑센터 방문 없는 노쇼핑 일정");
  if (policy.optionTour === "none") points.push("현지에서 선택관광을 권하지 않는 노옵션");
  if (input.tipPerPerson > 0) points.push("가이드·기사 경비 포함 — 현지에서 따로 내지 않습니다");
  if (mealCount > 0) points.push(`식사 ${mealCount}회 포함 (조식 제외)`);
  if (placeCount > 0) points.push(`방문지 ${placeCount}곳을 가이드와 함께`);
  if (hotel) points.push(`${hotel} 숙소`);
  const compare = quote ? buildTourCompare(input, days, pmChoice, quote, meta) : null;
  if (compare) {
    const s = compare.summary.strengths;
    if (s.some((x) => x.startsWith("가격:"))) points.push("대형 여행사의 같은 조건 상품보다 합리적인 가격");
    const only = compare.onlyOurs.slice(0, 4);
    if (only.length > 0) points.push(`다른 상품에서 보기 어려운 일정: ${only.join(", ")}`);
  }
  for (const h of meta?.highlights ?? []) if (h.trim() && points.length < 9) points.push(h.trim());

  return (
    <DocShell title="상품 소개서" subtitle={title} company={company}>
      <DocCover
        title={title}
        destination={input.destination || "-"}
        period={`${tripPeriod(input)} (${input.nights}박 ${input.days}일)`}
        travelers={`${quote.travelers}명`}
        priceLine={`1인 ${money(quote.partnerConsumerPrice ?? quote.scenario.pricePerPerson)}`}
      />

      <DocSection title="이 상품을 추천하는 이유">
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {points.map((p) => (
            <li key={p} className="flex gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-950">
              <span className="font-bold text-emerald-700">✓</span>
              {p}
            </li>
          ))}
        </ul>
      </DocSection>

      <DocSection title="포함 · 불포함">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-emerald-800">포함</p>
            <p>{included.join(", ") || "-"}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-700">불포함</p>
            <p>{excluded.join(", ") || "-"}</p>
            {localPay.rows.length > 0 && <p className="text-slate-500">현지에서 내는 비용: {localPay.rows.map((r) => r.name).join(", ")}</p>}
          </div>
        </div>
      </DocSection>

      <DocSection title="날짜별 하이라이트">
        <ol className="space-y-1">
          {days.map((d) => {
            const names = dayItems(d, pmChoice)
              .filter((i) => !SKIP.has(i.type ?? "sightseeing"))
              .map((i) => i.name)
              .slice(0, 6);
            const free = dayItems(d, pmChoice).some((i) => i.type === "free_time") && names.length === 0;
            return (
              <li key={d.day}>
                <b className="text-emerald-800">DAY {d.day}</b> {d.theme && <span className="text-slate-600">{d.theme} — </span>}
                {free ? "자유 일정" : names.join(" · ") || "이동"}
              </li>
            );
          })}
        </ol>
      </DocSection>

      <DocSection title="여행 상품을 고를 때 확인하세요">
        <ul className="list-disc space-y-0.5 pl-5 text-slate-700">
          <li>쇼핑센터 방문이 몇 번인지 — 이 상품: {policy.shopping === "none" ? "없음" : "일정표 참고"}</li>
          <li>현지 선택관광(옵션)과 금액 — 이 상품: {policy.optionTour === "none" ? "없음" : "선택 옵션 표 참고"}</li>
          <li>가이드·기사 경비(팁)를 현지에서 따로 내는지 — 이 상품: {input.tipPerPerson > 0 ? "포함" : "현지 지불"}</li>
          <li>포함 식사 횟수와 자유일정 일수 — 이 상품: 식사 {mealCount}회</li>
          <li>표시 가격에 항공·유류할증료가 들어 있는지</li>
        </ul>
        <p className="mt-1 text-[10px] text-slate-500">초저가 상품은 쇼핑·선택관광·현지 경비로 실제 비용이 늘어나는 경우가 있어, 총비용으로 비교하시길 권합니다.</p>
      </DocSection>
    </DocShell>
  );
}
