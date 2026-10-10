import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { CANCELLATION_TERMS, dayDate, dayMeals, documentItems, includeLists, noticeLines, tripPeriod } from "@/lib/documents";
import { customerFeeNote, localPayRows, moneyWithKrw } from "@/lib/fees";
import { formatDuration } from "@/lib/format";
import { gradeText } from "@/lib/itemTypes";
import { conditionTags, dayRegion, dayTable, defaultAlternative, mealLabel, shoppingStops, shortDescription, stayText, visitStyle } from "@/lib/itineraryDoc";
import { singleSupplement } from "@/lib/pricing";
import type { ItineraryItem } from "@/types";
import { intensityText } from "@/lib/intensity";
import { photoCredits, photoOf } from "@/lib/photo";
import { hotelPins, mapPoints } from "@/lib/regionPlan";
import { RouteFigure } from "./RouteFigure";
import { DocCover, DocCoverPage, DocFacts, DocSection, DocShell, type DocProps } from "./DocShell";

const ACCESSIBILITY_LABELS = { ok: "이용 가능", limited: "일부 구간 어려움", difficult: "이용 어려움", unknown: "확인 못함" } as const;
const STYLE_TONE = { 입장: "bg-emerald-100 text-emerald-800", 하차: "bg-sky-100 text-sky-800", 차창: "bg-slate-200 text-slate-700" } as const;
const KIND_MARK: Record<string, string> = { flight: "✈", meal: "🍴", hotel: "🏨", free_time: "☕", shopping: "🛍" };

/** 일정 칸 한 줄 — 이름·관광 방식·소요·한 줄 설명·현지 지불·주의 */
function ItemCell({ item, input }: { item: ItineraryItem; input: DocProps["input"] }) {
  const style = visitStyle(item);
  const stay = stayText(item);
  const fee = customerFeeNote(item, input);
  const a = item.accessibility;
  const desc = shortDescription(item.description);
  return (
    <>
      {photoOf(item) && (
        // eslint-disable-next-line @next/next/no-img-element -- 직접 올린 사진 data URL
        <img src={photoOf(item)!.src} alt="" aria-hidden title={photoOf(item)!.credit} className="float-right ml-2 h-14 w-20 rounded object-cover" />
      )}
      {KIND_MARK[item.type ?? ""] && <span className="mr-1" aria-hidden>{KIND_MARK[item.type ?? ""]}</span>}
      <span className="font-medium">{item.name}</span>
      {style && <span className={`ml-1 rounded px-1 text-[9.5px] font-semibold ${STYLE_TONE[style]}`}>{style}</span>}
      {(stay || fee) && <span className="text-slate-500"> ({[stay, fee].filter(Boolean).join(" · ")})</span>}
      {desc && <span className="block text-slate-500">{desc}</span>}
      {item.caution && <span className="block text-amber-700">⚠ {item.caution}</span>}
      {a && a.level !== "unknown" && (
        <span className="block text-[10px] text-slate-500">
          ♿ 이용 편의: {ACCESSIBILITY_LABELS[a.level]} (휠체어 {a.wheelchairAccessible ? "가능" : "어려움"})
        </span>
      )}
    </>
  );
}

/**
 * 고객용 여행일정표 — 업계 일정표 형식(일자·지역·교통편·시간·일정·식사 표)과 「국외여행상품 정보제공 표준안」 항목
 * (쇼핑 횟수·품목·소요시간, 선택관광 요금·소요·대체 일정, 가이드 경비, 일정 변경 고지), 관광진흥법 시행규칙 §21의 표시 항목,
 * 표준약관의 취소 규정을 담는다. 시각은 주요한 것만 적고 관광은 소요시간으로 적는다.
 */
export function ItineraryDoc({ input, days, pmChoice, quote, meta, company, travelInfo, season }: DocProps) {
  const localPay = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, localPay.rows.length > 0);
  const money = (v: number) => moneyWithKrw(v, input.currency, input.exchangeRateToKrw);
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const tags = conditionTags(input, days, pmChoice, meta, quote);
  const vehicle = quote.ourIncludes.vehicle;
  const flight = input.selectedFlight;
  const flightNos = { out: flight?.flightNumber ?? "", back: flight?.returnFlightNumber ?? "" };
  const full = input.packageType === "full";
  const single = singleSupplement(quote, input);
  const excludedText = [...excluded, ...(single ? [`싱글차지(1인실 사용 시 1인 +${money(single.price)})`] : [])];
  const shops = shoppingStops(days, pmChoice);
  const grade = input.lodgingType === "resort" ? "리조트" : gradeText(input.hotelGrade) || meta?.hotelGrade || "";
  const origin = input.originCity?.trim() || "인천";
  const weather = travelInfo?.weather || season?.weather || "";
  const info = [
    { label: "시차", value: travelInfo?.timeDifference ?? "" },
    { label: "전압", value: travelInfo?.voltage ?? "" },
    { label: "통화", value: travelInfo?.currency ?? "" },
    { label: "입국", value: travelInfo?.visa ?? "" },
    { label: "날씨", value: weather },
    { label: "긴급 전화", value: travelInfo?.emergency ?? "" },
    { label: "대사관·영사관", value: travelInfo?.embassy ?? "" },
    { label: "여행사 비상연락", value: company.emergencyContact.trim() },
  ].filter((r) => r.value);

  const heroItem = days.flatMap((d) => documentItems(d, pmChoice).flatMap((b) => b.items)).find((i) => photoOf(i));
  const heroPhoto = heroItem ? photoOf(heroItem)!.src : undefined;
  return (
    <>
    {input.customerName.trim() && (
      <DocCoverPage
        company={company}
        customer={input.customerName.trim()}
        title={title}
        period={`${tripPeriod(input)} (${input.nights}박 ${input.days}일)`}
        travelers={`${quote.travelers}명`}
        photo={heroPhoto}
      />
    )}
    <DocShell title="여행일정표" subtitle={title} company={company}>
      <DocCover
        title={title}
        destination={input.destination || "-"}
        period={`${tripPeriod(input)} (${input.nights}박 ${input.days}일)`}
        travelers={`${quote.travelers}명`}
        priceLine={`1인 ${money(quote.scenario.pricePerPerson)}`}
      />
      <ul aria-label="상품 조건" className="-mt-2 flex flex-wrap gap-1">
        {tags.map((t) => (
          <li key={t} className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            {t}
          </li>
        ))}
      </ul>

      <DocSection title="여행 개요">
        <DocFacts
          rows={[
            { label: "상품명", value: title },
            { label: "여행지", value: input.destination || "-" },
            { label: "여행기간", value: `${tripPeriod(input)} (${input.nights}박 ${input.days}일)` },
            { label: "인원", value: `${quote.travelers}명` },
            ...(input.minTravelers > 0 ? [{ label: "최저 행사인원", value: `${input.minTravelers}명 (미달 시 출발 7일 전까지 통보)` }] : []),
            { label: "여행경비", value: `1인 ${money(quote.scenario.pricePerPerson)} (총 ${money(quote.scenario.totalPrice)})` },
            ...(grade && quote.lodgingUnits > 0 ? [{ label: "숙소", value: `${grade} (2인 1실 기준)` }] : []),
            ...(intensityText(days, pmChoice) ? [{ label: "활동 강도", value: intensityText(days, pmChoice) }] : []),
            {
              label: "여행경보단계",
              value: input.travelAlert
                ? `${input.travelAlert.country} ${input.travelAlert.levelLabel}${input.travelAlert.note ? ` · ${input.travelAlert.note}` : ""}`
                : "출발 전 외교부 해외안전여행(0404.go.kr)에서 확인해 주세요",
            },
            ...(input.customerName.trim() ? [{ label: "수신", value: input.customerName.trim() }] : []),
          ]}
        />
      </DocSection>

      {(full || flight || input.meetingNote.trim() || input.pickupNote.trim() || input.sendingNote.trim()) && (
        <DocSection title="항공 · 미팅">
          {flight && (
            <table className="mb-1.5 w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-50 text-left">
                  <th className="px-2 py-1 font-medium">구분</th>
                  <th className="px-2 py-1 font-medium">항공편</th>
                  <th className="px-2 py-1 font-medium">출발</th>
                  <th className="px-2 py-1 font-medium">도착</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr className="border-b border-slate-200">
                  <td className="px-2 py-1">가는 편</td>
                  <td className="px-2 py-1">{[flight.airline, flight.flightNumber].filter(Boolean).join(" ") || "확정 후 안내"}</td>
                  <td className="px-2 py-1">{[flight.departDate, flight.departTime, flight.departAirport].filter(Boolean).join(" ") || "-"}</td>
                  <td className="px-2 py-1">{[flight.arriveTime, flight.arriveAirport].filter(Boolean).join(" ") || "-"}</td>
                </tr>
                {(flight.returnFlightNumber || flight.returnDepartTime) && (
                  <tr className="border-b border-slate-200">
                    <td className="px-2 py-1">오는 편</td>
                    <td className="px-2 py-1">{[flight.airline, flight.returnFlightNumber].filter(Boolean).join(" ")}</td>
                    <td className="px-2 py-1">{[flight.returnDepartDate, flight.returnDepartTime, flight.returnDepartAirport].filter(Boolean).join(" ")}</td>
                    <td className="px-2 py-1">{[flight.returnArriveTime, flight.returnArriveAirport].filter(Boolean).join(" ")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <DocFacts
            rows={[
              ...(full || flight ? [{ label: "출국 미팅", value: input.meetingNote.trim() || `항공 출발 3시간 전 ${origin}공항 (단체 카운터·담당자 연락처는 출발 2~3일 전 안내)` }] : []),
              ...(input.pickupNote.trim() ? [{ label: "현지 공항 픽업", value: input.pickupNote.trim() }] : []),
              ...(input.sendingNote.trim() ? [{ label: "현지 공항 샌딩", value: input.sendingNote.trim() }] : []),
            ]}
          />
          {full && !flight && <p className="mt-1 text-[10px] text-slate-500">항공편(편명·시각)은 확정 후 안내합니다.</p>}
        </DocSection>
      )}

      {mapPoints(days, pmChoice).flat().length >= 3 && (
        <DocSection title="코스 그림">
          <RouteFigure days={days} pmChoice={pmChoice} hotels={hotelPins(input.selectedHotels)} />
        </DocSection>
      )}
      <DocSection title="일자별 일정">
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="border-b-2 border-emerald-600 bg-emerald-50 text-left text-emerald-900">
              <th scope="col" className="w-16 px-1.5 py-1 font-semibold">일자</th>
              <th scope="col" className="w-20 px-1.5 py-1 font-semibold">지역</th>
              <th scope="col" className="w-16 px-1.5 py-1 font-semibold">교통편</th>
              <th scope="col" className="w-12 px-1.5 py-1 font-semibold">시간</th>
              <th scope="col" className="px-1.5 py-1 font-semibold">일정</th>
              <th scope="col" className="w-24 px-1.5 py-1 font-semibold">식사</th>
            </tr>
          </thead>
          {days.map((day, index) => {
            const meals = dayMeals(days, index, pmChoice, input);
            const date = dayDate(input, day.day);
            const flat = documentItems(day, pmChoice).flatMap((b) => b.items);
            const timings = computeItemTimings(flat, dayTourStart(day));
            const table = dayTable(days, index, pmChoice, { vehicle, flight: flightNos, selectedHotels: input.selectedHotels }, timings);
            const flightDay = table.flightDay;
            const hotelName = table.overnight?.hotel ?? undefined;
            type Row = { key: string; transport: string; time: string; body: React.ReactNode; tone?: string };
            const rows: Row[] = table.rows.map((r) => {
              if (r.kind === "free")
                return {
                  key: r.key,
                  transport: "",
                  time: "",
                  body: (
                    <>
                      <b>전일 자유일정</b> <span className="text-slate-500">(가이드·차량 불포함)</span>
                      {r.tips && r.tips.length > 0 && <span className="block text-slate-500">추천: {r.tips.join(" / ")}</span>}
                    </>
                  ),
                };
              if (r.kind === "label") return { key: r.key, transport: "", time: "", body: <b className="text-slate-700">{r.label}</b> };
              if (r.kind === "meeting")
                return { key: r.key, transport: r.transport === "vehicle" ? "전용차량" : "", time: r.afterBreakfast ? "조식 후" : r.start, body: <span className="font-medium">🏨 호텔 로비 미팅 후 출발</span> };
              if (r.kind === "move")
                return {
                  key: r.key,
                  transport: "",
                  time: "",
                  body: <span className="text-slate-400">↓ {r.moveName ? `${r.moveName}${r.minutes ? ` (약 ${formatDuration(r.minutes)})` : ""}` : `${vehicle ? "전용차량" : "이동"} 약 ${formatDuration(r.minutes ?? 0)}`}</span>,
                  tone: "text-slate-400",
                };
              return {
                key: r.key,
                // 항공은 편명(모르면 "항공"), 그날 첫 차량 이동은 "전용차량"
                transport: r.transport === "vehicle" ? "전용차량" : r.transport === "flight" ? "항공" : r.transport,
                // 시각을 모르는 날의 첫 항목은 "조식 후" (기본 08:00을 그대로 쓰지 않는다), 주요 일정만 시각
                time: r.afterBreakfast ? "조식 후" : r.keyTime ? r.start : "",
                body: (
                  <>
                    <ItemCell item={r.item!} input={input} />
                    {r.returnFlight && <span className="block text-slate-500">출발 2~3시간 전 공항 도착 · 출국 수속</span>}
                  </>
                ),
              };
            });
            const span = rows.length + (day.overnightCity ? 1 : 0);
            return (
              <tbody key={day.day} className="break-inside-avoid border-b-2 border-emerald-200 align-top">
                {rows.map((r, i) => (
                  <tr key={r.key} className="border-b border-slate-100">
                    {i === 0 && (
                      <>
                        <td rowSpan={span} className="px-1.5 py-1 font-bold text-emerald-900">
                          제{day.day}일
                          {date && <span className="block font-normal text-slate-600">{date.slice(5)}</span>}
                        </td>
                        <td rowSpan={span} className="px-1.5 py-1 text-slate-700">
                          {dayRegion(days, index, origin)}
                          {day.theme && <span className="block text-[9.5px] text-slate-400">{day.theme}</span>}
                        </td>
                      </>
                    )}
                    <td className="px-1.5 py-1 text-slate-600">{r.transport}</td>
                    <td className="px-1.5 py-1 font-semibold tabular-nums text-emerald-700">{r.time}</td>
                    <td className={`px-1.5 py-1 ${r.tone ?? ""}`}>{r.body}</td>
                    {i === 0 && (
                      <td rowSpan={span} className="px-1.5 py-1 text-[10px] leading-4 text-slate-700">
                        <span className="block">조: {mealLabel(meals.breakfast, "breakfast", flightDay, full)}</span>
                        <span className="block">중: {mealLabel(meals.lunch, "lunch", flightDay, full)}</span>
                        <span className="block">석: {mealLabel(meals.dinner, "dinner", flightDay, full)}</span>
                      </td>
                    )}
                  </tr>
                ))}
                {day.overnightCity && (
                  <tr>
                    <td colSpan={3} className="px-1.5 py-1 text-slate-700">
                      🏨 HOTEL: {hotelName ?? `${day.overnightCity} 시내 호텔`} 또는 동급{grade ? ` (${grade})` : ""}
                      <span className="text-slate-400"> · 체크인 15:00 / 체크아웃 11:00 전후 (호텔 규정)</span>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
        <p className="mt-1.5 text-[10px] text-slate-600">
          ※ 상기 일정은 항공 및 현지 사정(교통·날씨·운영 시간)에 따라 순서·시간이 변경될 수 있으며, 일정을 바꿀 때는 미리 안내하고 동의를 받습니다. 표의 시각은 주요 일정만 적은 예정 시각입니다.
        </p>
        <p className="text-[10px] text-slate-500">관광 표기 — 입장: 내부 관람 · 하차: 외관 관람·사진 · 차창: 차 안에서 관람</p>
      </DocSection>

      <DocSection title="포함 · 불포함 사항">
        <DocFacts
          rows={[
            { label: "포함", value: included.length > 0 ? included.join(", ") : "별도 안내" },
            { label: "불포함", value: excludedText.join(", ") },
          ]}
        />
      </DocSection>

      <DocSection title="가이드 · 기사 경비">
        <p>
          {input.tipPerPerson > 0
            ? `여행경비에 포함 (1인 ${money(input.tipPerPerson)}) — 현지에서 따로 내지 않습니다.`
            : "여행경비에 포함되어 있지 않으며 현지에서 가이드에게 직접 지불합니다. 금액은 출발 전 안내드립니다."}
        </p>
      </DocSection>

      <DocSection title="쇼핑 정보">
        {shops.length === 0 ? (
          <p>노쇼핑 — 일정에 쇼핑센터 방문이 없습니다.</p>
        ) : (
          <>
            <p className="mb-1">쇼핑센터 방문 {shops.length}회 (구매는 자유이며 강요하지 않습니다)</p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-50 text-left">
                  <th className="w-14 px-2 py-1 font-medium">일자</th>
                  <th className="px-2 py-1 font-medium">장소</th>
                  <th className="px-2 py-1 font-medium">품목</th>
                  <th className="w-20 px-2 py-1 text-right font-medium">소요</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((s) => (
                  <tr key={`${s.day}-${s.name}`} className="border-b border-slate-200">
                    <td className="px-2 py-1">DAY {s.day}</td>
                    <td className="px-2 py-1">{s.name}</td>
                    <td className="px-2 py-1">{s.goods || "현지 안내"}</td>
                    <td className="px-2 py-1 text-right">{s.minutes > 0 ? `약 ${formatDuration(s.minutes)}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[10px] text-slate-500">구입한 물품의 교환·환불은 매장 규정에 따르며, 귀국 후 문제가 있으면 여행사로 연락 주시면 도와드립니다.</p>
          </>
        )}
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

      <DocSection title="선택관광 안내">
        {input.options.length === 0 ? (
          <p>노옵션 — 선택관광이 없습니다.</p>
        ) : (
          <>
            <p className="mb-1 text-slate-600">기본 요금에 포함되어 있지 않으며, 참여 여부는 자유롭게 선택하실 수 있습니다. 참여하지 않아도 불이익이 없습니다.</p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-50 text-left">
                  <th className="w-12 px-2 py-1 font-medium">일자</th>
                  <th className="px-2 py-1 font-medium">선택관광 (소요)</th>
                  <th className="w-24 px-2 py-1 text-right font-medium">1인 요금</th>
                  <th className="px-2 py-1 font-medium">미참여 시 일정</th>
                </tr>
              </thead>
              <tbody>
                {input.options.map((option) => (
                  <tr key={option.id} className="border-b border-slate-200 align-top">
                    <td className="px-2 py-1 text-slate-600">{option.dayNo > 0 ? `DAY ${option.dayNo}` : "-"}</td>
                    <td className="px-2 py-1">
                      {option.name}
                      {option.durationMinutes > 0 && <span className="text-slate-500"> (약 {formatDuration(option.durationMinutes)})</span>}
                      <span className="block text-[10px] text-slate-500">{option.minParticipants}명 이상 진행</span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{money(option.pricePerPerson)}</td>
                    <td className="px-2 py-1 text-slate-600">{option.alternative?.trim() || defaultAlternative(option)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[10px] text-slate-500">현지 사정(날씨·최소 인원)에 따라 진행되지 않을 수 있으며, 그 경우 요금은 받지 않습니다.</p>
          </>
        )}
      </DocSection>

      {info.length > 0 && (
        <DocSection title="여행 정보">
          <DocFacts rows={info} />
          {travelInfo && !travelInfo.searched && <p className="mt-1 text-[10px] text-slate-500">일부 정보는 출발 전 다시 확인해 주세요.</p>}
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
      {photoCredits(days, pmChoice).length > 0 && <p className="text-[9px] text-slate-400">사진 출처 — {photoCredits(days, pmChoice).join(" / ")}</p>}
    </DocShell>
    </>
  );
}
