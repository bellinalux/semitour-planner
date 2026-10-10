import { bookingChecklist } from "@/lib/bookingChecklist";
import { calcDayEnd, computeItemTimings, dayMeetingTime, STANDARD_DAY_END } from "@/lib/dayLoad";
import { dayDate, tripPeriod } from "@/lib/documents";
import { continuousDriving } from "@/lib/driverHours";
import { formatDuration } from "@/lib/format";
import { dayItems } from "@/lib/itinerary";
import { findZigzag, offRouteMeals } from "@/lib/routeOrder";
import type { ItineraryItem } from "@/types";
import { DocFacts, DocSection, DocShell, type DocProps } from "./DocShell";

const TYPE_LABELS: Record<string, string> = {
  flight: "항공",
  transfer: "이동",
  hotel: "숙소",
  meal: "식사",
  free_time: "자유",
  shopping: "쇼핑",
  massage: "마사지",
  experience: "체험",
  sightseeing: "관광",
};

/** 현장에서 챙길 것 — 식사 예약·현지 지불·입장권·주의사항·차량 하차/픽업 지점 */
function fieldNotes(item: ItineraryItem, travelers: number): string[] {
  const notes: string[] = [];
  const local = item.payment === "local";
  if (item.type === "meal") {
    notes.push(`${travelers}명 식사 예약 확인${item.cuisine ? ` (${item.cuisine})` : ""}`);
    if (local) notes.push("식대 현지 지불(고객 부담)");
  } else if (item.entryFee > 0) notes.push(local ? "입장료 현지 지불(고객 부담)" : `입장권 ${travelers}매 준비 (요금 포함)`);
  if (item.timeNote) notes.push(`시각 ${item.timeNote}`);
  if (item.timeCheck?.basis === "area" && (item.timeCheck.dropOff || item.timeCheck.pickUp))
    notes.push([item.timeCheck.dropOff && `차량 하차: ${item.timeCheck.dropOff}`, item.timeCheck.pickUp && `픽업: ${item.timeCheck.pickUp}`].filter(Boolean).join(" → 걸어서 → "));
  if (item.caution) notes.push(`⚠ ${item.caution}`);
  return notes;
}

/**
 * 가이드·기사 운영 지시서 (내부·현지용) — 판매가·원가 없이, 현장에서 필요한 시각표·차량 하차/픽업·식사 예약·입장권·주의사항과
 * 그날 운영 경고(연속 운전 휴게·지그재그·동선 밖 식당·늦은 종료)를 날짜별 한 장으로 정리한다. 랜드사·가이드·기사에게 넘긴다.
 */
export function OperationDoc({ input, days, pmChoice, quote, meta, company }: DocProps) {
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const travelers = quote.travelers;
  const hotels = Object.values(input.selectedHotels).map((h) => h.name);
  const hotelText = hotels.length > 0 ? hotels.join(", ") : input.supplierQuote?.hotels || "확정 전";

  return (
    <DocShell title="운영 지시서" subtitle={`${title} — 가이드·기사용 · 가격 정보 없음`} company={company}>
      <DocSection title="행사 개요">
        <DocFacts
          rows={[
            { label: "상품", value: title },
            { label: "기간", value: `${tripPeriod(input)} (${input.nights}박 ${input.days}일)` },
            { label: "인원", value: `${travelers}명${input.minTravelers > 0 ? ` (최저 행사인원 ${input.minTravelers}명)` : ""}` },
            { label: "숙소", value: hotelText },
            ...(input.pickupNote.trim() ? [{ label: "공항 픽업", value: input.pickupNote.trim() }] : []),
            ...(input.sendingNote.trim() ? [{ label: "공항 샌딩", value: input.sendingNote.trim() }] : []),
            ...(input.customerName.trim() ? [{ label: "고객·단체", value: input.customerName.trim() }] : []),
          ]}
        />
      </DocSection>

      {days.map((day) => {
        const items = dayItems(day, pmChoice);
        const timings = computeItemTimings(items, dayMeetingTime(day));
        const date = dayDate(input, day.day);
        const end = calcDayEnd(day, pmChoice);
        const warnings = [
          ...continuousDriving(day, pmChoice).map((w) => `기사 연속 운전 ${formatDuration(w.minutes)} (${w.from} → ${w.to}) — 중간 30분 이상 휴게(15분씩 나눠 가능)`),
          ...findZigzag(day, pmChoice).map((z) => `지그재그 동선: ${z.from} → ${z.area}로 되돌아옴 — 순서 확인`),
          ...offRouteMeals(day, pmChoice).map((m) => `${m.mealName}이(가) ${m.mealRegion}에 있어 ${m.hereRegion} 일정 중 다녀와야 함 — 식당·순서 확인`),
          ...(end?.isLate ? [`종료 ${end.endTime} — 표준 종료(${STANDARD_DAY_END}) 이후, 기사 운행 시간 확인`] : []),
        ];
        return (
          <DocSection key={day.day} title={`DAY ${day.day}${date ? ` · ${date}` : ""}${day.theme ? ` · ${day.theme}` : ""}`}>
            <p className="mb-1 text-slate-600">
              미팅 {dayMeetingTime(day)}
              {day.overnightCity ? ` · 숙박 ${day.overnightCity}${input.selectedHotels[day.overnightCity.trim()] ? ` (${input.selectedHotels[day.overnightCity.trim()].name})` : ""}` : ""}
            </p>
            <table className="w-full border-collapse text-[10.5px]">
              <thead>
                <tr className="border-b border-emerald-200 bg-emerald-50 text-left text-emerald-900">
                  <th scope="col" className="w-20 px-1.5 py-1 font-semibold">
                    시각
                  </th>
                  <th scope="col" className="px-1.5 py-1 font-semibold">
                    일정
                  </th>
                  <th scope="col" className="w-20 px-1.5 py-1 font-semibold">
                    다음 이동
                  </th>
                  <th scope="col" className="px-1.5 py-1 font-semibold">
                    현장 메모
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const t = timings.get(item.id);
                  const notes = fieldNotes(item, travelers);
                  return (
                    <tr key={item.id} className="break-inside-avoid border-b border-slate-100 align-top">
                      <td className="px-1.5 py-1 tabular-nums">{t ? `${t.start}–${t.end}` : ""}</td>
                      <td className="px-1.5 py-1">
                        <span className="mr-1 text-[9.5px] text-slate-500">[{TYPE_LABELS[item.type ?? "sightseeing"] ?? "관광"}]</span>
                        <span className="font-medium">{item.name}</span>
                      </td>
                      <td className="px-1.5 py-1 tabular-nums text-slate-600">
                        {item.type !== "flight" && (item.travelMinutesToNext ?? 0) > 0 ? formatDuration(item.travelMinutesToNext ?? 0) : ""}
                      </td>
                      <td className="px-1.5 py-1 text-slate-700">
                        {notes.map((n) => (
                          <span key={n} className="block">
                            {n}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {warnings.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-amber-800">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </DocSection>
        );
      })}

      {input.options.length > 0 && (
        <DocSection title="선택관광 (신청자만)">
          <ul className="list-disc pl-5">
            {input.options.map((o) => (
              <li key={o.id}>
                {o.dayNo > 0 ? `DAY ${o.dayNo} · ` : ""}
                {o.name}
                {o.minParticipants > 0 ? ` — 최소 ${o.minParticipants}명` : ""}
                {o.durationMinutes > 0 ? ` · 약 ${formatDuration(o.durationMinutes)}` : ""}
              </li>
            ))}
          </ul>
        </DocSection>
      )}

      <DocSection title="예약 확인 체크리스트">
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th scope="col" className="w-6 px-1.5 py-1" aria-label="확인" />
              <th scope="col" className="w-20 px-1.5 py-1 font-semibold">
                구분
              </th>
              <th scope="col" className="px-1.5 py-1 font-semibold">
                확인할 것
              </th>
              <th scope="col" className="w-24 px-1.5 py-1 font-semibold">
                기한
              </th>
              <th scope="col" className="w-20 px-1.5 py-1 font-semibold">
                담당
              </th>
              <th scope="col" className="w-28 px-1.5 py-1 font-semibold">
                확정번호·메모
              </th>
            </tr>
          </thead>
          <tbody>
            {bookingChecklist(input, days, pmChoice, travelers).map((c) => (
              <tr key={`${c.group}-${c.label}`} className="break-inside-avoid border-b border-slate-100 align-top">
                <td className="px-1.5 py-1">☐</td>
                <td className="px-1.5 py-1 text-slate-600">{c.group}</td>
                <td className="px-1.5 py-1">{c.label}</td>
                <td className="px-1.5 py-1 tabular-nums">{c.due ? `${c.due} (D-${c.dueDays})` : `출발 D-${c.dueDays}`}</td>
                <td className="px-1.5 py-1" />
                <td className="px-1.5 py-1" />
              </tr>
            ))}
          </tbody>
        </table>
      </DocSection>

      <p className="text-[10px] text-slate-500">
        시각은 일정표의 체류·이동 시간으로 계산한 예정 시각입니다. 현지 교통·날씨에 따라 가이드가 조정하고, 식사·입장 예약 시각은 업체에 확인하세요.
      </p>
    </DocShell>
  );
}
