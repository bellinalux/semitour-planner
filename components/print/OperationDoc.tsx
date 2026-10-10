import { bookingChecklist } from "@/lib/bookingChecklist";
import { timeRange } from "@/lib/dayTidy";
import { calcDayEnd, computeItemTimings, dayMeetingTime, dayTourStart, STANDARD_DAY_END } from "@/lib/dayLoad";
import { dayDate, dayMeals, documentItems, tripPeriod } from "@/lib/documents";
import { continuousDriving } from "@/lib/driverHours";
import { formatDuration } from "@/lib/format";
import { gradeText } from "@/lib/itemTypes";
import { dayRegion, dayTable, defaultAlternative, mealLabel, shoppingStops, visitStyle } from "@/lib/itineraryDoc";
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
  if (item.type === "shopping") notes.push("구매 강요 금지 · 소요시간 지키기");
  if (item.timeNote) notes.push(`시각 ${item.timeNote}`);
  if (item.timeCheck?.basis === "area" && (item.timeCheck.dropOff || item.timeCheck.pickUp))
    notes.push([item.timeCheck.dropOff && `차량 하차: ${item.timeCheck.dropOff}`, item.timeCheck.pickUp && `픽업: ${item.timeCheck.pickUp}`].filter(Boolean).join(" → 걸어서 → "));
  if (item.caution) notes.push(`⚠ ${item.caution}`);
  return notes;
}

/**
 * 가이드·기사 운영 지시서 (내부·현지용) — 고객 일정표와 같은 하루 표(미팅 → 이동 → 장소, 연결 이동 줄, HOTEL 줄)에
 * 현장용 정보를 더한다: 모든 항목의 시작–끝 시각, 관광 방식, 식사 예약·입장권·하차/픽업 지점, 그날 운영 경고(연속 운전 휴게·지그재그·
 * 동선 밖 식당·늦은 종료), 선택관광 미참여자 일정, 쇼핑 소요, 예약 확인 체크리스트. 판매가·원가는 넣지 않는다.
 */
export function OperationDoc({ input, days, pmChoice, quote, meta, company, travelInfo }: DocProps) {
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const travelers = quote.travelers;
  const hotels = Object.values(input.selectedHotels).map((h) => h.name);
  const hotelText = hotels.length > 0 ? hotels.join(", ") : input.supplierQuote?.hotels || "확정 전";
  const vehicle = quote.ourIncludes.vehicle;
  const flight = input.selectedFlight;
  const full = input.packageType === "full";
  const grade = input.lodgingType === "resort" ? "리조트" : gradeText(input.hotelGrade) || meta?.hotelGrade || "";
  const origin = input.originCity?.trim() || "인천";
  const shops = shoppingStops(days, pmChoice);

  return (
    <DocShell title="운영 지시서" subtitle={`${title} — 가이드·기사용 · 가격 정보 없음`} company={company}>
      <DocSection title="행사 개요">
        <DocFacts
          rows={[
            { label: "상품", value: title },
            { label: "기간", value: `${tripPeriod(input)} (${input.nights}박 ${input.days}일)` },
            { label: "인원", value: `${travelers}명${input.minTravelers > 0 ? ` (최저 행사인원 ${input.minTravelers}명)` : ""}` },
            { label: "숙소", value: `${hotelText}${grade ? ` (${grade})` : ""}` },
            ...(flight?.flightNumber
              ? [{ label: "항공", value: `가는 편 ${flight.flightNumber} ${flight.departTime}→${flight.arriveTime}${flight.returnFlightNumber ? ` / 오는 편 ${flight.returnFlightNumber} ${flight.returnDepartTime}→${flight.returnArriveTime}` : ""}` }]
              : []),
            ...(full || flight ? [{ label: "출국 미팅", value: input.meetingNote.trim() || `출발 3시간 전 ${origin}공항` }] : []),
            ...(input.pickupNote.trim() ? [{ label: "공항 픽업", value: input.pickupNote.trim() }] : []),
            ...(input.sendingNote.trim() ? [{ label: "공항 샌딩", value: input.sendingNote.trim() }] : []),
            ...(input.customerName.trim() ? [{ label: "고객·단체", value: input.customerName.trim() }] : []),
            { label: "가이드 경비", value: input.tipPerPerson > 0 ? "상품가 포함 — 고객에게 따로 받지 않음" : "현지 지불 (금액은 출발 전 안내한 대로)" },
            ...(travelInfo?.emergency ? [{ label: "현지 긴급", value: travelInfo.emergency }] : []),
            ...(travelInfo?.embassy ? [{ label: "대사관·영사관", value: travelInfo.embassy }] : []),
            ...(company.emergencyContact.trim() ? [{ label: "여행사 비상연락", value: company.emergencyContact.trim() }] : []),
          ]}
        />
      </DocSection>

      {days.map((day, index) => {
        const flat = documentItems(day, pmChoice).flatMap((b) => b.items);
        const timings = computeItemTimings(flat, dayTourStart(day));
        const table = dayTable(days, index, pmChoice, { vehicle, flight: { out: flight?.flightNumber ?? "", back: flight?.returnFlightNumber ?? "" }, selectedHotels: input.selectedHotels }, timings);
        const meals = dayMeals(days, index, pmChoice, input);
        const date = dayDate(input, day.day);
        const end = calcDayEnd(day, pmChoice);
        const options = input.options.filter((o) => o.dayNo === day.day);
        const warnings = [
          ...continuousDriving(day, pmChoice).map((w) => `기사 연속 운전 ${formatDuration(w.minutes)} (${w.from} → ${w.to}) — 중간 30분 이상 휴게(15분씩 나눠 가능)`),
          ...findZigzag(day, pmChoice).map((z) => `지그재그 동선: ${z.from} → ${z.area}로 되돌아옴 — 순서 확인`),
          ...offRouteMeals(day, pmChoice).map((m) => `${m.mealName}이(가) ${m.mealRegion}에 있어 ${m.hereRegion} 일정 중 다녀와야 함 — 식당·순서 확인`),
          ...(end?.isLate ? [`종료 ${end.endTime} — 표준 종료(${STANDARD_DAY_END}) 이후, 기사 운행 시간 확인`] : []),
          ...(!day.meetingTime?.trim() && !table.flightDay ? ["미팅 시각이 정해지지 않았습니다 (계산은 08:00 기준) — 전날 고객에게 미팅 시각 안내"] : []),
        ];
        return (
          <DocSection key={day.day} title={`DAY ${day.day}${date ? ` · ${date}` : ""} · ${dayRegion(days, index, origin)}${day.theme ? ` · ${day.theme}` : ""}`}>
            <p className="mb-1 text-slate-600">
              미팅 {dayMeetingTime(day)} · 식사 조 {mealLabel(meals.breakfast, "breakfast", table.flightDay, full)} / 중 {mealLabel(meals.lunch, "lunch", table.flightDay, full)} / 석{" "}
              {mealLabel(meals.dinner, "dinner", table.flightDay, full)}
            </p>
            <table className="w-full border-collapse text-[10.5px]">
              <thead>
                <tr className="border-b border-emerald-200 bg-emerald-50 text-left text-emerald-900">
                  <th scope="col" className="w-20 px-1.5 py-1 font-semibold">
                    시각
                  </th>
                  <th scope="col" className="w-16 px-1.5 py-1 font-semibold">
                    교통편
                  </th>
                  <th scope="col" className="px-1.5 py-1 font-semibold">
                    일정
                  </th>
                  <th scope="col" className="px-1.5 py-1 font-semibold">
                    현장 메모
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => {
                  if (r.kind === "move")
                    return (
                      <tr key={r.key} className="text-slate-400">
                        <td />
                        <td />
                        <td className="px-1.5 py-0.5" colSpan={2}>
                          ↓ {r.moveName ? `${r.moveName}${r.minutes ? ` ${formatDuration(r.minutes)}` : ""}` : `${vehicle ? "전용차량" : "이동"} ${formatDuration(r.minutes ?? 0)}`}
                        </td>
                      </tr>
                    );
                  if (r.kind === "label")
                    return (
                      <tr key={r.key}>
                        <td colSpan={4} className="px-1.5 py-1 font-semibold text-slate-700">
                          {r.label}
                        </td>
                      </tr>
                    );
                  if (r.kind === "free")
                    return (
                      <tr key={r.key} className="border-b border-slate-100">
                        <td />
                        <td />
                        <td className="px-1.5 py-1 font-medium">전일 자유일정 (가이드·차량 없음)</td>
                        <td className="px-1.5 py-1 text-slate-700">{r.tips?.join(" / ") || "고객 비상연락 대기"}</td>
                      </tr>
                    );
                  if (r.kind === "meeting")
                    return (
                      <tr key={r.key} className="border-b border-slate-100 align-top">
                        <td className="px-1.5 py-1 font-semibold tabular-nums">{r.start}</td>
                        <td className="px-1.5 py-1 text-slate-600">{r.transport === "vehicle" ? "전용차량" : ""}</td>
                        <td className="px-1.5 py-1 font-medium">호텔 로비 미팅 · 인원 확인 후 출발</td>
                        <td className="px-1.5 py-1 text-slate-700">{travelers}명 · 차량은 미팅 전 호텔 도착 대기</td>
                      </tr>
                    );
                  const item = r.item!;
                  const style = visitStyle(item);
                  return (
                    <tr key={r.key} className="break-inside-avoid border-b border-slate-100 align-top">
                      <td className="px-1.5 py-1 tabular-nums">{r.start ? timeRange({ start: r.start, end: r.end }, "–") : ""}</td>
                      <td className="px-1.5 py-1 text-slate-600">{r.transport === "vehicle" ? "전용차량" : r.transport === "flight" ? "항공" : r.transport}</td>
                      <td className="px-1.5 py-1">
                        <span className="mr-1 text-[9.5px] text-slate-500">[{TYPE_LABELS[item.type ?? "sightseeing"] ?? "관광"}]</span>
                        <span className="font-medium">{item.name}</span>
                        {style && <span className="ml-1 rounded bg-slate-100 px-1 text-[9.5px] text-slate-600">{style}</span>}
                        {r.returnFlight && <span className="block text-slate-500">출발 2~3시간 전 공항 도착 · 출국 수속 안내</span>}
                      </td>
                      <td className="px-1.5 py-1 text-slate-700">
                        {fieldNotes(item, travelers).map((n) => (
                          <span key={n} className="block">
                            {n}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
                {table.overnight && (
                  <tr>
                    <td />
                    <td />
                    <td colSpan={2} className="px-1.5 py-1 text-slate-700">
                      🏨 HOTEL: {table.overnight.hotel ?? `${table.overnight.city} 호텔 (확정 전)`}
                      {grade ? ` (${grade})` : ""} · {travelers}명 객실 배정·조식 시간 안내
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {options.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-slate-700">
                {options.map((o) => (
                  <li key={o.id}>
                    선택관광 {o.name}
                    {o.durationMinutes > 0 ? ` (약 ${formatDuration(o.durationMinutes)})` : ""} — 최소 {o.minParticipants}명 · 미참여자: {o.alternative?.trim() || defaultAlternative(o)}
                  </li>
                ))}
              </ul>
            )}
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

      {input.options.some((o) => o.dayNo <= 0) && (
        <DocSection title="선택관광 (날짜 미정)">
          <ul className="list-disc pl-5">
            {input.options
              .filter((o) => o.dayNo <= 0)
              .map((o) => (
                <li key={o.id}>
                  {o.name}
                  {o.minParticipants > 0 ? ` — 최소 ${o.minParticipants}명` : ""}
                  {o.durationMinutes > 0 ? ` · 약 ${formatDuration(o.durationMinutes)}` : ""} · 미참여자: {o.alternative?.trim() || defaultAlternative(o)}
                </li>
              ))}
          </ul>
        </DocSection>
      )}

      <DocSection title="쇼핑 운영">
        {shops.length === 0 ? (
          <p>노쇼핑 상품 — 쇼핑센터 방문 금지 (고객이 원해도 일정 외 방문은 고객 동의를 받은 뒤)</p>
        ) : (
          <ul className="list-disc pl-5">
            {shops.map((s) => (
              <li key={`${s.day}-${s.name}`}>
                DAY {s.day} {s.name}
                {s.goods ? ` (${s.goods})` : ""} — {s.minutes > 0 ? `${formatDuration(s.minutes)} 이내` : "안내한 시간 지키기"}, 구매 강요 금지
              </li>
            ))}
          </ul>
        )}
      </DocSection>

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
        시각은 미팅 시각과 호텔→첫 장소 이동, 일정표의 체류·이동 시간으로 계산한 예정 시각입니다. 현지 교통·날씨에 따라 가이드가 조정하고, 일정을 바꿀 때는 고객 동의를 받으세요. 식사·입장 예약 시각은 업체에 확인하세요.
      </p>
    </DocShell>
  );
}
