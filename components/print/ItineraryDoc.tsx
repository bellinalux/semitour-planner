import { CANCELLATION_TERMS, dayDate, dayMeals, documentItems, includeLists, noticeLines, tripPeriod } from "@/lib/documents";
import { hotelLines } from "@/lib/exportText";
import { customerFeeNote, localPayRows } from "@/lib/fees";
import { formatDuration } from "@/lib/format";
import { moneyWithKrw } from "@/lib/fees";
import type { ItineraryItem } from "@/types";
import { DocCover, DocFacts, DocSection, DocShell, type DocProps } from "./DocShell";

const ACCESSIBILITY_LABELS = { ok: "이용 가능", limited: "일부 구간 어려움", difficult: "이용 어려움", unknown: "확인 못함" } as const;
const ACCESSIBILITY_TONE = {
  ok: "bg-emerald-50 text-emerald-800",
  limited: "bg-amber-50 text-amber-800",
  difficult: "bg-rose-50 text-rose-800",
  unknown: "bg-slate-100 text-slate-500",
} as const;

function ItemLine({ item, input, number }: { item: ItineraryItem; input: DocProps["input"]; number: number }) {
  const time = item.timeNote || (item.stayMinutes > 0 ? `약 ${formatDuration(item.stayMinutes)}` : "");
  const fee = customerFeeNote(item, input);
  const notes = [time, item.admission === "view_only" ? "외부 조망" : "", fee].filter(Boolean);
  const a = item.accessibility;

  return (
    <li className="py-0.5">
      <div className="flex gap-2">
        <span className="w-4 shrink-0 text-right font-semibold text-slate-500">{number}.</span>
        <span>
          <span className="font-medium">{item.name}</span>
          {notes.length > 0 && <span className="text-slate-500"> ({notes.join(" · ")})</span>}
          {item.description && <span className="block text-slate-500">{item.description}</span>}
          {item.caution && <span className="block text-amber-700">⚠ {item.caution}</span>}
          {/* 확인 못한(unknown) 이용 편의시설 정보는 고객용 문서에 신뢰할 수 없는 내용을 보여주지 않도록 아예 표시하지 않는다 */}
          {a && a.level !== "unknown" && (
            <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${ACCESSIBILITY_TONE[a.level]}`}>
              ♿ 이용 편의시설: {ACCESSIBILITY_LABELS[a.level]} — 휠체어 {a.wheelchairAccessible ? "가능" : "어려움"} · 장애인 화장실{" "}
              {a.accessibleRestroom ? "있음" : "없음/미확인"} · 엘리베이터 {a.elevator ? "있음" : "없음/미확인"} · 경사로 {a.ramp ? "있음" : "없음/미확인"}
              {a.note && ` (${a.note})`}
            </span>
          )}
        </span>
      </div>
      {item.travelMinutesToNext !== null && item.travelMinutesToNext > 0 && (
        <p className="pl-6 text-slate-400">↓ 이동 {formatDuration(item.travelMinutesToNext)}</p>
      )}
    </li>
  );
}

/** 고객용 여행일정표. 관광진흥법 시행규칙 §21의 표시 항목과 표준약관의 취소 규정을 함께 담는다. */
export function ItineraryDoc({ input, days, pmChoice, quote, meta, company }: DocProps) {
  const localPay = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, localPay.rows.length > 0);
  const money = (v: number) => moneyWithKrw(v, input.currency, input.exchangeRateToKrw);
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;

  return (
    <DocShell title="여행일정표" subtitle={title} company={company}>
      <DocCover
        title={title}
        destination={input.destination || "-"}
        period={`${tripPeriod(input)} (${input.nights}박 ${input.days}일)`}
        travelers={`${quote.travelers}명`}
        priceLine={`1인 ${money(quote.scenario.pricePerPerson)}`}
      />

      <DocSection title="여행 개요">
        <DocFacts
          rows={[
            { label: "상품명", value: title },
            { label: "여행지", value: input.destination || "-" },
            { label: "여행기간", value: `${tripPeriod(input)} (${input.nights}박 ${input.days}일)` },
            { label: "인원", value: `${quote.travelers}명` },
            ...(input.minTravelers > 0 ? [{ label: "최저 행사인원", value: `${input.minTravelers}명` }] : []),
            { label: "여행경비", value: `1인 ${money(quote.scenario.pricePerPerson)} (총 ${money(quote.scenario.totalPrice)})` },
            {
              label: "여행경보단계",
              value: input.travelAlert
                ? `${input.travelAlert.country} ${input.travelAlert.levelLabel}${input.travelAlert.note ? ` · ${input.travelAlert.note}` : ""}`
                : "출발 전 외교부 해외안전여행(0404.go.kr)에서 확인해 주세요",
            },
            ...(input.customerName.trim() ? [{ label: "수신", value: input.customerName.trim() }] : []),
            ...(input.pickupNote.trim() ? [{ label: "공항 픽업", value: input.pickupNote.trim() }] : []),
            ...(input.sendingNote.trim() ? [{ label: "공항 샌딩", value: input.sendingNote.trim() }] : []),
          ]}
        />
      </DocSection>

      <DocSection title="일자별 일정">
        <div className="space-y-3">
          {days.map((day, index) => {
            const meals = dayMeals(days, index, pmChoice, input);
            const date = dayDate(input, day.day);
            return (
              <div key={day.day} className="break-inside-avoid border border-emerald-100">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-emerald-100 bg-emerald-50 px-2 py-1.5">
                  <p className="font-bold text-emerald-900">
                    DAY {day.day}
                    {date && <span className="ml-1.5 font-normal text-slate-600">{date}</span>}
                    {day.theme && <span className="ml-1.5 font-normal text-slate-600">· {day.theme}</span>}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    식사 조: {meals.breakfast.mark}
                    {meals.breakfast.cuisine && `(${meals.breakfast.cuisine})`} / 중: {meals.lunch.mark}
                    {meals.lunch.cuisine && `(${meals.lunch.cuisine})`} / 석: {meals.dinner.mark}
                    {meals.dinner.cuisine && `(${meals.dinner.cuisine})`}
                    {day.overnightCity
                      ? ` · 숙박: ${day.overnightCity}${input.selectedHotels[day.overnightCity.trim()] ? ` (${input.selectedHotels[day.overnightCity.trim()].name})` : ""}`
                      : ""}
                  </p>
                </div>
                <div className="space-y-1.5 px-2 py-1.5">
                  {documentItems(day, pmChoice).map((block) => (
                    <div key={block.label}>
                      {block.label && <p className="font-semibold text-slate-700">{block.label}</p>}
                      <ul>
                        {block.items.map((item, index) => (
                          <ItemLine key={item.id} item={item} input={input} number={index + 1} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {Object.keys(input.selectedHotels).length > 0 && quote.lodgingUnits > 0 && (
          <p className="mt-1.5 text-slate-600">
            {hotelLines(input.selectedHotels).map((line, i) => (
              <span key={i} className="block">
                숙소: {line} 또는 동급
              </span>
            ))}
          </p>
        )}
        {Object.keys(input.selectedHotels).length === 0 && meta?.hotelGrade && (
          <p className="mt-1.5 text-slate-600">숙소: {meta.hotelGrade} 또는 동급</p>
        )}
      </DocSection>

      <DocSection title="포함 · 불포함 사항">
        <DocFacts
          rows={[
            { label: "포함", value: included.length > 0 ? included.join(", ") : "별도 안내" },
            { label: "불포함", value: excluded.join(", ") },
          ]}
        />
      </DocSection>

      {localPay.rows.length > 0 && (
        <DocSection title="현지 지불 안내">
          <p className="mb-1 text-slate-600">아래 항목은 여행경비에 포함되어 있지 않으며, 현지에서 직접 지불하십니다.</p>
          <table className="w-full border-collapse">
            <tbody>
              {localPay.rows.map((row) => (
                <tr key={`${row.day}-${row.name}`} className="border-b border-slate-200">
                  <td className="w-16 px-2 py-1 text-slate-600">DAY {row.day}</td>
                  <td className="px-2 py-1">{row.name}</td>
                  <td className="w-40 px-2 py-1 text-right tabular-nums">{row.amount > 0 ? money(row.amount) : "현지 안내"}</td>
                </tr>
              ))}
              {localPay.perPerson > 0 && (
                <tr className="border-b border-slate-300 font-semibold">
                  <td className="px-2 py-1" colSpan={2}>
                    1인 합계 (예상)
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(localPay.perPerson)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-500">현지 요금과 환율은 시즌·현지 사정에 따라 달라질 수 있습니다.</p>
        </DocSection>
      )}

      {input.options.length > 0 && (
        <DocSection title="선택 옵션 안내">
          <p className="mb-1 text-slate-600">기본 요금에 포함되어 있지 않으며, 참여 여부는 자유롭게 선택하실 수 있습니다.</p>
          <table className="w-full border-collapse">
            <tbody>
              {input.options.map((option) => (
                <tr key={option.id} className="border-b border-slate-200">
                  <td className="w-16 px-2 py-1 text-slate-600">{option.dayNo > 0 ? `DAY ${option.dayNo}` : "-"}</td>
                  <td className="px-2 py-1">
                    {option.name}
                    {option.durationMinutes > 0 && <span className="text-slate-500"> (약 {formatDuration(option.durationMinutes)})</span>}
                  </td>
                  <td className="w-24 px-2 py-1 text-right text-slate-600">{option.minParticipants}명 이상</td>
                  <td className="w-32 px-2 py-1 text-right tabular-nums">1인 {money(option.pricePerPerson)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-500">
            옵션에 참여하지 않으시는 경우 자유시간 또는 대체 일정으로 진행되며, 현지 사정에 따라 변경·취소될 수 있습니다.
          </p>
        </DocSection>
      )}

      <DocSection title="취소 및 환불 규정">
        <p className="mb-1 text-slate-600">국외여행 표준약관 및 소비자분쟁해결기준에 따릅니다. (여행개시일 기준)</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-2 py-1 font-medium">취소 시점</th>
              <th className="px-2 py-1 font-medium">위약금</th>
            </tr>
          </thead>
          <tbody>
            {CANCELLATION_TERMS.map((term) => (
              <tr key={term.when} className="border-b border-slate-200">
                <td className="px-2 py-1">{term.when}</td>
                <td className="px-2 py-1">{term.fee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DocSection>

      <DocSection title="유의사항">
        <ul className="space-y-0.5">
          {noticeLines(input, company).map((line) => (
            <li key={line} className="flex gap-1.5">
              <span aria-hidden>·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        {company.emergencyContact.trim() && <p className="mt-1.5 font-medium">비상연락처: {company.emergencyContact.trim()}</p>}
      </DocSection>
    </DocShell>
  );
}
