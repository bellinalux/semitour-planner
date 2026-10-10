import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { CANCELLATION_TERMS, dayMeals, documentItems, includeLists } from "@/lib/documents";
import { docTitle, englishDate, englishDayDate, englishDuration, englishMeal, englishMoney, englishPeriod, englishTags, VISIT_EN } from "@/lib/englishDoc";
import { localPayRows } from "@/lib/fees";
import { dayRegion, dayTable, shoppingStops, shortDescription, visitStyle } from "@/lib/itineraryDoc";
import { singleSupplement } from "@/lib/pricing";
import type { ItineraryItem } from "@/types";
import type { DocProps } from "./DocShell";

const KIND: Record<string, string> = {
  sightseeing: "Sightseeing",
  experience: "Activity",
  massage: "Spa",
  shopping: "Shopping",
  meal: "Meal",
  hotel: "Hotel",
  free_time: "Free time",
  flight: "Flight",
};
const STAY_TYPES = new Set(["sightseeing", "experience", "massage", "shopping"]);
const STYLE_TONE: Record<string, string> = { Entry: "bg-emerald-100 text-emerald-800", "Photo stop": "bg-sky-100 text-sky-800", "Drive-by": "bg-slate-200 text-slate-700" };

/** 취소 규정 영어 (표준약관 기준, 여행 시작일 기준) */
const CANCEL_EN: Record<string, string> = {
  "여행개시 30일 전까지 (~30일)": "Up to 30 days before departure — deposit refunded (no fee)",
  "여행개시 29일 전 ~ 20일 전": "29–20 days before — 10% of the tour price",
  "여행개시 19일 전 ~ 10일 전": "19–10 days before — 15%",
  "여행개시 9일 전 ~ 8일 전": "9–8 days before — 20%",
  "여행개시 7일 전 ~ 1일 전": "7–1 days before — 30%",
  "여행 당일 이후": "On the day of departure or later — 50%",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 break-inside-avoid">
      <h2 className="mb-1 border-b border-emerald-200 pb-0.5 text-sm font-bold text-emerald-900">{title}</h2>
      {children}
    </section>
  );
}

/**
 * 영문 일정표·견적서 (Itinerary & Quotation) — 고객용 일정표와 같은 업계 표 형식(Day · Area · Transport · Time · Schedule · Meals),
 * 조건 표식, 관광 방식(Entry·Photo stop·Drive-by), 이동 연결 줄, 항공·미팅, 쇼핑·선택관광(미참여 일정)·가이드 경비·여행 정보.
 * 한글 글은 번역표(translations)로 바꾸고, 없으면 원문을 둔다. 원가·마진은 넣지 않는다.
 */
export function EnglishDoc({ input, days, pmChoice, quote, meta, company, translations = {}, travelInfo }: DocProps) {
  const t = (s: string | undefined | null) => {
    const k = (s ?? "").trim();
    return translations[k] ?? translations[k.slice(0, 400)] ?? k;
  };
  const price = quote.partnerConsumerPrice ?? quote.scenario.pricePerPerson;
  const localPay = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, localPay.rows.length > 0);
  const title = t(docTitle({ input, meta }));
  const tags = englishTags({ input, days, pmChoice, meta, quote });
  const vehicle = quote.ourIncludes.vehicle;
  const flight = input.selectedFlight;
  const full = input.packageType === "full";
  const single = singleSupplement(quote, input);
  const shops = shoppingStops(days, pmChoice);
  const origin = input.originCity?.trim() || "Incheon";
  const grade = /^(\d)(?:-(\d))?$/.exec(input.hotelGrade);
  const gradeEn = input.lodgingType === "resort" ? "Resort" : grade ? (grade[2] ? `${grade[1]}–${grade[2]} star` : `${grade[1]}-star`) : t(meta?.hotelGrade);
  const info = travelInfo
    ? [
        ["Time difference", travelInfo.timeDifference],
        ["Voltage", travelInfo.voltage],
        ["Currency", travelInfo.currency],
        ["Entry (Korean passport)", travelInfo.visa],
        ["Weather", travelInfo.weather],
        ["Emergency", travelInfo.emergency],
        ["Korean embassy / consulate", travelInfo.embassy],
      ].filter(([, v]) => v)
    : [];

  const itemCell = (it: ItineraryItem) => {
    const style = visitStyle(it);
    const styleEn = style ? VISIT_EN[style] : "";
    const stay = it.timeNote ? t(it.timeNote) : STAY_TYPES.has(it.type ?? "sightseeing") && it.stayMinutes > 0 ? `approx. ${englishDuration(it.stayMinutes)}` : "";
    const desc = shortDescription(it.description);
    return (
      <>
        <span className="font-medium">{t(it.name)}</span>
        {styleEn && <span className={`ml-1 rounded px-1 text-[9.5px] font-semibold ${STYLE_TONE[styleEn]}`}>{styleEn}</span>}
        {(stay || it.payment === "local") && <span className="text-slate-500"> ({[stay, it.payment === "local" ? "paid locally" : ""].filter(Boolean).join(" · ")})</span>}
        {desc && <span className="block text-slate-500">{t(desc)}</span>}
      </>
    );
  };

  return (
    <article lang="en" className="mx-auto max-w-[190mm] break-keep bg-white p-8 text-[11px] leading-5 text-slate-900 print:p-0">
      <div className="h-1.5 rounded-t bg-emerald-600 print:rounded-none" aria-hidden />
      <header className="flex items-end justify-between gap-4 border-b-2 border-emerald-600 px-1 pb-3 pt-3">
        <div>
          <h1 className="text-xl font-bold text-emerald-900">Itinerary &amp; Quotation</h1>
          <p className="mt-1 text-xs text-slate-600">{title}</p>
        </div>
        <div className="shrink-0 text-right">
          {company.name && <p className="text-sm font-semibold text-emerald-800">{t(company.name)}</p>}
          <p className="mt-0.5 text-[11px] text-slate-500">Issued {englishDate(new Date())}</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
        <span className="text-slate-500">Tour</span>
        <span className="font-semibold">{title}</span>
        <span className="text-slate-500">Destination</span>
        <span>{t(input.destination)}</span>
        <span className="text-slate-500">Dates</span>
        <span>
          {englishPeriod(input)} ({input.nights} night{input.nights === 1 ? "" : "s"} / {input.days} day{input.days === 1 ? "" : "s"})
        </span>
        <span className="text-slate-500">Travelers</span>
        <span>{quote.travelers}</span>
        {input.minTravelers > 0 && (
          <>
            <span className="text-slate-500">Minimum group</span>
            <span>{input.minTravelers} (notified 7 days before departure if not met)</span>
          </>
        )}
      </section>
      <ul aria-label="Tour conditions" className="mt-2 flex flex-wrap gap-1">
        {tags.map((tag) => (
          <li key={tag} className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            {tag}
          </li>
        ))}
      </ul>

      <Section title="Price">
        <table className="w-full border-collapse">
          <tbody className="tabular-nums">
            <tr className="border-b border-slate-200">
              <td className="px-2 py-1.5">Price per person{quote.lodgingUnits > 0 ? " (twin sharing)" : ""}</td>
              <td className="px-2 py-1.5 text-right font-semibold">{englishMoney(price, input.currency)}</td>
            </tr>
            <tr className="border-b-2 border-slate-800 font-bold">
              <td className="px-2 py-1.5">Total for {quote.travelers}</td>
              <td className="px-2 py-1.5 text-right">{englishMoney(price * quote.travelers, input.currency)}</td>
            </tr>
          </tbody>
        </table>
        {single && <p className="mt-1 text-slate-600">Single room supplement: +{englishMoney(single.price, input.currency)} per person</p>}
      </Section>

      {(full || flight) && (
        <Section title="Flights & meeting">
          {flight && (
            <table className="mb-1 w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-50 text-left">
                  <th className="px-2 py-1 font-medium">Leg</th>
                  <th className="px-2 py-1 font-medium">Flight</th>
                  <th className="px-2 py-1 font-medium">Departure</th>
                  <th className="px-2 py-1 font-medium">Arrival</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr className="border-b border-slate-200">
                  <td className="px-2 py-1">Outbound</td>
                  <td className="px-2 py-1">{[flight.airline, flight.flightNumber].filter(Boolean).join(" ") || "TBA"}</td>
                  <td className="px-2 py-1">{[flight.departDate, flight.departTime].filter(Boolean).join(" ") || "-"}</td>
                  <td className="px-2 py-1">{flight.arriveTime || "-"}</td>
                </tr>
                {(flight.returnFlightNumber || flight.returnDepartTime) && (
                  <tr className="border-b border-slate-200">
                    <td className="px-2 py-1">Return</td>
                    <td className="px-2 py-1">{[flight.airline, flight.returnFlightNumber].filter(Boolean).join(" ")}</td>
                    <td className="px-2 py-1">{[flight.returnDepartDate, flight.returnDepartTime].filter(Boolean).join(" ")}</td>
                    <td className="px-2 py-1">{flight.returnArriveTime}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <p className="text-slate-700">Meeting: {input.meetingNote.trim() ? t(input.meetingNote) : `${origin} Airport, 3 hours before departure (exact counter will be sent 2–3 days before)`}</p>
        </Section>
      )}

      <Section title="Day-by-day itinerary">
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="border-b-2 border-emerald-600 bg-emerald-50 text-left text-emerald-900">
              <th scope="col" className="w-16 px-1.5 py-1 font-semibold">Day</th>
              <th scope="col" className="w-20 px-1.5 py-1 font-semibold">Area</th>
              <th scope="col" className="w-16 px-1.5 py-1 font-semibold">Transport</th>
              <th scope="col" className="w-12 px-1.5 py-1 font-semibold">Time</th>
              <th scope="col" className="px-1.5 py-1 font-semibold">Schedule</th>
              <th scope="col" className="w-28 px-1.5 py-1 font-semibold">Meals</th>
            </tr>
          </thead>
          {days.map((d, index) => {
            const flat = documentItems(d, pmChoice).flatMap((b) => b.items);
            const timings = computeItemTimings(flat, dayTourStart(d));
            const table = dayTable(days, index, pmChoice, { vehicle, flight: { out: flight?.flightNumber ?? "", back: flight?.returnFlightNumber ?? "" }, selectedHotels: input.selectedHotels }, timings);
            const meals = dayMeals(days, index, pmChoice, input);
            const date = englishDayDate(input, d.day);
            const region = dayRegion(days, index, input.originCity?.trim() || "인천")
              .split(" → ")
              .map((x) => t(x))
              .join(" → ");
            const span = table.rows.length + (table.overnight ? 1 : 0);
            return (
              <tbody key={d.day} className="break-inside-avoid border-b-2 border-emerald-200 align-top">
                {table.rows.map((r, i) => (
                  <tr key={r.key} className="border-b border-slate-100">
                    {i === 0 && (
                      <>
                        <td rowSpan={span} className="px-1.5 py-1 font-bold text-emerald-900">
                          Day {d.day}
                          {date && <span className="block font-normal text-slate-600">{date}</span>}
                        </td>
                        <td rowSpan={span} className="px-1.5 py-1 text-slate-700">
                          {region}
                          {d.theme && <span className="block text-[9.5px] text-slate-400">{t(d.theme)}</span>}
                        </td>
                      </>
                    )}
                    <td className="px-1.5 py-1 text-slate-600">{r.transport === "vehicle" ? "Private vehicle" : r.transport === "flight" ? "Flight" : r.transport}</td>
                    <td className="px-1.5 py-1 font-semibold tabular-nums text-emerald-700">{r.afterBreakfast ? "After breakfast" : (r.kind === "item" || r.kind === "meeting") && r.keyTime ? r.start : ""}</td>
                    <td className="px-1.5 py-1">
                      {r.kind === "free" && (
                        <>
                          <b>Free day</b> <span className="text-slate-500">(no guide or vehicle)</span>
                          {r.tips && r.tips.length > 0 && <span className="block text-slate-500">Suggested: {r.tips.map((x) => t(x)).join(" / ")}</span>}
                        </>
                      )}
                      {r.kind === "meeting" && <span className="font-medium">Meet at the hotel lobby and depart</span>}
                      {r.kind === "label" && <b className="text-slate-700">{r.label?.startsWith("오전") ? "Morning · guided tour" : "Afternoon · free choice"}</b>}
                      {r.kind === "move" && (
                        <span className="text-slate-400">
                          ↓ {r.moveName ? t(r.moveName) : vehicle ? "Private vehicle" : "Transfer"}
                          {r.minutes ? ` approx. ${englishDuration(r.minutes)}` : ""}
                        </span>
                      )}
                      {r.kind === "item" && r.item && (
                        <>
                          <span className="mr-1 text-[9.5px] text-slate-400">{KIND[r.item.type ?? "sightseeing"] ?? ""}</span>
                          {itemCell(r.item)}
                          {r.returnFlight && <span className="block text-slate-500">Arrive at the airport 2–3 hours before departure for check-in</span>}
                        </>
                      )}
                    </td>
                    {i === 0 && (
                      <td rowSpan={span} className="px-1.5 py-1 text-[10px] leading-4 text-slate-700">
                        <span className="block">B: {englishMeal(meals.breakfast, "breakfast", table.flightDay, full, t)}</span>
                        <span className="block">L: {englishMeal(meals.lunch, "lunch", table.flightDay, full, t)}</span>
                        <span className="block">D: {englishMeal(meals.dinner, "dinner", table.flightDay, full, t)}</span>
                      </td>
                    )}
                  </tr>
                ))}
                {table.overnight && (
                  <tr>
                    <td colSpan={3} className="px-1.5 py-1 text-slate-700">
                      HOTEL: {table.overnight.hotel ? t(table.overnight.hotel) : `Hotel in ${t(table.overnight.city)}`} or similar{gradeEn ? ` (${gradeEn})` : ""}
                      <span className="text-slate-400"> · check-in 15:00 / check-out around 11:00 (hotel policy)</span>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
        <p className="mt-1.5 text-[10px] text-slate-600">
          The order and times may change due to flights or local conditions (traffic, weather, opening hours); we will inform you and ask for your consent before any change. Only key times are shown.
        </p>
        <p className="text-[10px] text-slate-500">Entry: inside visit · Photo stop: outside visit · Drive-by: seen from the vehicle</p>
      </Section>

      <Section title="Included / Not included">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <h3 className="font-bold text-emerald-900">Included</h3>
            <p>{included.map(t).join(", ") || "-"}</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-700">Not included</h3>
            <p>{[...excluded.map(t), ...(single ? [`Single supplement (+${englishMoney(single.price, input.currency)})`] : [])].join(", ") || "-"}</p>
          </div>
        </div>
      </Section>

      <Section title="Guide & driver tips">
        <p>{input.tipPerPerson > 0 ? `Included in the tour price (${englishMoney(input.tipPerPerson, input.currency)} per person). No extra tips are requested.` : "Not included. Please pay the guide directly at the destination; the amount will be advised before departure."}</p>
      </Section>

      <Section title="Shopping">
        {shops.length === 0 ? (
          <p>No shopping stops in this itinerary.</p>
        ) : (
          <>
            <p>
              {shops.length} shopping stop{shops.length > 1 ? "s" : ""} — purchases are entirely optional.
            </p>
            <ul className="list-disc pl-5">
              {shops.map((s) => (
                <li key={`${s.day}-${s.name}`}>
                  Day {s.day}: {t(s.name)}
                  {s.goods && ` — ${t(s.goods)}`}
                  {s.minutes > 0 && ` (approx. ${englishDuration(s.minutes)})`}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="Optional tours">
        {input.options.length === 0 ? (
          <p>No optional tours.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 text-left">
                <th className="w-12 px-2 py-1 font-medium">Day</th>
                <th className="px-2 py-1 font-medium">Tour</th>
                <th className="w-24 px-2 py-1 text-right font-medium">Per person</th>
                <th className="px-2 py-1 font-medium">If not joining</th>
              </tr>
            </thead>
            <tbody>
              {input.options.map((o) => (
                <tr key={o.id} className="border-b border-slate-200 align-top">
                  <td className="px-2 py-1">{o.dayNo > 0 ? `Day ${o.dayNo}` : "-"}</td>
                  <td className="px-2 py-1">
                    {t(o.name)}
                    {o.durationMinutes > 0 && <span className="text-slate-500"> (approx. {englishDuration(o.durationMinutes)})</span>}
                    <span className="block text-[10px] text-slate-500">Runs with {o.minParticipants}+ people</span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{englishMoney(o.pricePerPerson, input.currency)}</td>
                  <td className="px-2 py-1 text-slate-600">{o.alternative?.trim() ? t(o.alternative) : "Free time at a place advised by the guide, then rejoin the group (no extra cost)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {info.length > 0 && (
        <Section title="Travel information">
          <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-0.5">
            {info.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k}</dt>
                <dd>{t(v)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Cancellation">
        <p className="text-slate-600">Cancellation fees follow the Korean standard terms for overseas travel (based on days before departure):</p>
        <ul className="list-disc pl-5 text-slate-700">
          {CANCELLATION_TERMS.map((c) => (
            <li key={c.when}>{CANCEL_EN[c.when] ?? `${c.when} — ${c.fee}`}</li>
          ))}
        </ul>
      </Section>

      <footer className="mt-6 border-t border-slate-300 pt-3 text-[10px] leading-4 text-slate-600">
        <p>Prices are subject to availability at the time of booking.</p>
        {(company.phone || company.email || company.emergencyContact.trim()) && (
          <p className="mt-1">Contact: {[company.phone, company.email, company.emergencyContact.trim() && `Emergency ${company.emergencyContact.trim()}`].filter(Boolean).join(" · ")}</p>
        )}
      </footer>
    </article>
  );
}
