import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { dayMeals, documentItems, includeLists } from "@/lib/documents";
import { docTitle } from "@/lib/englishDoc";
import { DICT, foreignDate, foreignDayDate, foreignDuration, foreignMeal, foreignMoney, foreignPeriod, foreignTags, type DocLang } from "@/lib/foreignDoc";
import { localPayRows } from "@/lib/fees";
import { dayRegion, dayTable, shoppingStops, shortDescription, visitStyle } from "@/lib/itineraryDoc";
import { singleSupplement } from "@/lib/pricing";
import type { ItineraryItem } from "@/types";
import { docAccent, type DocProps } from "./DocShell";

const STAY_TYPES = new Set(["sightseeing", "experience", "massage", "shopping"]);
const STYLE_TONE = { 입장: "bg-emerald-100 text-emerald-800", 하차: "bg-sky-100 text-sky-800", 차창: "bg-slate-200 text-slate-700" } as const;
const COL_WIDTH = ["w-16", "w-20", "w-16", "w-12", "", "w-28"];

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 break-inside-avoid">
      <h2 className="mb-1 border-b pb-0.5 text-sm font-bold" style={{ color, borderColor: color }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * 외국어 일정표·견적서 (영어·일본어·중국어) — 고객용 일정표와 같은 업계 표 형식(일자·지역·교통편·시간·일정·식사),
 * 조건 표식, 관광 방식, 이동 연결 줄, 호텔 미팅 줄, 항공·미팅, 쇼핑·선택관광(미참여 일정)·가이드 경비·여행 정보·취소 규정.
 * 문서 틀 글자는 언어 사전으로, 한글 글은 번역표로 바꾼다 (없으면 원문). 원가·마진은 넣지 않는다.
 */
export function EnglishDoc({ input, days, pmChoice, quote, meta, company, translations = {}, translationsByLang, travelInfo, lang = "en" }: DocProps & { lang?: DocLang }) {
  const L = DICT[lang];
  const words = translationsByLang?.[lang] ?? (lang === "en" ? translations : {});
  const t = (s: string | undefined | null) => {
    const k = (s ?? "").trim();
    return words[k] ?? words[k.slice(0, 400)] ?? k;
  };
  const money = (v: number) => foreignMoney(lang, v, input.currency);
  const dur = (m: number) => foreignDuration(lang, m);
  const accent = docAccent(company);
  const price = quote.partnerConsumerPrice ?? quote.scenario.pricePerPerson;
  const localPay = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, localPay.rows.length > 0);
  const title = t(docTitle({ input, meta }));
  const tags = foreignTags(lang, { input, days, pmChoice, meta, quote });
  const vehicle = quote.ourIncludes.vehicle;
  const flight = input.selectedFlight;
  const full = input.packageType === "full";
  const single = singleSupplement(quote, input);
  const shops = shoppingStops(days, pmChoice);
  const origin = input.originCity?.trim() || "인천";
  const grade = /^(\d)(?:-(\d))?$/.exec(input.hotelGrade);
  const gradeLabel = input.lodgingType === "resort" ? L.tags.resort : grade ? L.tags.star(grade[1], grade[2]) : t(meta?.hotelGrade);
  const info = travelInfo
    ? [travelInfo.timeDifference, travelInfo.voltage, travelInfo.currency, travelInfo.visa, travelInfo.weather, travelInfo.emergency, travelInfo.embassy].map((v, i) => [L.infoLabels[i], v] as const).filter(([, v]) => v)
    : [];

  const itemCell = (it: ItineraryItem) => {
    // 일찍 끝나는 날의 자유시간 줄 (문서에만 있는 줄)
    if (it.id === "rest-pm" || it.id === "rest-checkin") return <b className="text-slate-700">{it.id === "rest-pm" ? L.restPm : L.checkinRest}</b>;
    const style = visitStyle(it);
    const stay = it.timeNote ? t(it.timeNote) : STAY_TYPES.has(it.type ?? "sightseeing") && it.stayMinutes > 0 ? L.approx(dur(it.stayMinutes)) : "";
    const desc = shortDescription(it.description);
    return (
      <>
        {it.photo && (
          // eslint-disable-next-line @next/next/no-img-element -- 직접 올린 사진 data URL
          <img src={it.photo} alt="" aria-hidden className="float-right ml-2 h-14 w-20 rounded object-cover" />
        )}
        <span className="mr-1 text-[9.5px] text-slate-400">{L.kinds[it.type ?? "sightseeing"] ?? ""}</span>
        <span className="font-medium">{t(it.name)}</span>
        {style && <span className={`ml-1 rounded px-1 text-[9.5px] font-semibold ${STYLE_TONE[style]}`}>{L.styles[style]}</span>}
        {(stay || it.payment === "local") && <span className="text-slate-500"> ({[stay, it.payment === "local" ? L.paidLocally : ""].filter(Boolean).join(" · ")})</span>}
        {desc && <span className="block text-slate-500">{t(desc)}</span>}
      </>
    );
  };

  return (
    <article lang={lang} className="mx-auto max-w-[190mm] break-keep bg-white p-8 text-[11px] leading-5 text-slate-900 print:p-0">
      <div className="h-1.5 rounded-t print:rounded-none" style={{ background: accent }} aria-hidden />
      <header className="flex items-end justify-between gap-4 border-b-2 px-1 pb-3 pt-3" style={{ borderColor: accent }}>
        <div className="flex items-end gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- 인쇄 문서 */}
          <img src={company.logo || "/logo-mark.png"} alt="" aria-hidden className="h-9 w-9 shrink-0 object-contain" />
          <div>
            <h1 className="text-xl font-bold" style={{ color: accent }}>
              {L.docTitle}
            </h1>
            <p className="mt-1 text-xs text-slate-600">{title}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {company.name && (
            <p className="text-sm font-semibold" style={{ color: accent }}>
              {t(company.name)}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {L.issued} {foreignDate(lang, new Date())}
          </p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
        <span className="text-slate-500">{L.tour}</span>
        <span className="font-semibold">{title}</span>
        <span className="text-slate-500">{L.destination}</span>
        <span>{t(input.destination)}</span>
        <span className="text-slate-500">{L.dates}</span>
        <span>
          {foreignPeriod(lang, input)} ({L.nightsDays(input.nights, input.days)})
        </span>
        <span className="text-slate-500">{L.travelers}</span>
        <span>{quote.travelers}</span>
        {input.minTravelers > 0 && (
          <>
            <span className="text-slate-500">{L.minGroup}</span>
            <span>{L.minGroupNote(input.minTravelers)}</span>
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

      <Section title={L.price} color={accent}>
        <table className="w-full border-collapse">
          <tbody className="tabular-nums">
            <tr className="border-b border-slate-200">
              <td className="px-2 py-1.5">
                {L.pricePerPerson}
                {quote.lodgingUnits > 0 ? L.twin : ""}
              </td>
              <td className="px-2 py-1.5 text-right font-semibold">{money(price)}</td>
            </tr>
            <tr className="border-b-2 border-slate-800 font-bold">
              <td className="px-2 py-1.5">{L.totalFor(quote.travelers)}</td>
              <td className="px-2 py-1.5 text-right">{money(price * quote.travelers)}</td>
            </tr>
          </tbody>
        </table>
        {single && <p className="mt-1 text-slate-600">{L.single(money(single.price))}</p>}
      </Section>

      {(full || flight) && (
        <Section title={L.flights} color={accent}>
          {flight && (
            <table className="mb-1 w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-50 text-left">
                  <th className="px-2 py-1 font-medium">{L.leg}</th>
                  <th className="px-2 py-1 font-medium">{L.flight}</th>
                  <th className="px-2 py-1 font-medium">{L.departure}</th>
                  <th className="px-2 py-1 font-medium">{L.arrival}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr className="border-b border-slate-200">
                  <td className="px-2 py-1">{L.outbound}</td>
                  <td className="px-2 py-1">{[flight.airline, flight.flightNumber].filter(Boolean).join(" ") || L.tba}</td>
                  <td className="px-2 py-1">{[flight.departDate, flight.departTime].filter(Boolean).join(" ") || "-"}</td>
                  <td className="px-2 py-1">{flight.arriveTime || "-"}</td>
                </tr>
                {(flight.returnFlightNumber || flight.returnDepartTime) && (
                  <tr className="border-b border-slate-200">
                    <td className="px-2 py-1">{L.return}</td>
                    <td className="px-2 py-1">{[flight.airline, flight.returnFlightNumber].filter(Boolean).join(" ")}</td>
                    <td className="px-2 py-1">{[flight.returnDepartDate, flight.returnDepartTime].filter(Boolean).join(" ")}</td>
                    <td className="px-2 py-1">{flight.returnArriveTime}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <p className="text-slate-700">
            {L.meeting}: {input.meetingNote.trim() ? t(input.meetingNote) : L.meetingDefault(t(origin))}
          </p>
        </Section>
      )}

      <Section title={L.dayByDay} color={accent}>
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="border-b-2 bg-slate-50 text-left" style={{ borderColor: accent }}>
              {L.cols.map((c, i) => (
                <th key={c} scope="col" className={`px-1.5 py-1 font-semibold ${COL_WIDTH[i]}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          {days.map((d, index) => {
            const flat = documentItems(d, pmChoice).flatMap((b) => b.items);
            const timings = computeItemTimings(flat, dayTourStart(d));
            const table = dayTable(days, index, pmChoice, { vehicle, flight: { out: flight?.flightNumber ?? "", back: flight?.returnFlightNumber ?? "" }, selectedHotels: input.selectedHotels }, timings);
            const meals = dayMeals(days, index, pmChoice, input);
            const date = foreignDayDate(lang, input, d.day);
            const region = dayRegion(days, index, origin)
              .split(" → ")
              .map((x) => t(x))
              .join(" → ");
            const span = table.rows.length + (table.overnight ? 1 : 0);
            return (
              <tbody key={d.day} className="break-inside-avoid border-b-2 border-slate-200 align-top">
                {table.rows.map((r, i) => (
                  <tr key={r.key} className="border-b border-slate-100">
                    {i === 0 && (
                      <>
                        <td rowSpan={span} className="px-1.5 py-1 font-bold" style={{ color: accent }}>
                          {L.dayN(d.day)}
                          {date && <span className="block font-normal text-slate-600">{date}</span>}
                        </td>
                        <td rowSpan={span} className="px-1.5 py-1 text-slate-700">
                          {region}
                          {d.theme && <span className="block text-[9.5px] text-slate-400">{t(d.theme)}</span>}
                        </td>
                      </>
                    )}
                    <td className="px-1.5 py-1 text-slate-600">{r.transport === "vehicle" ? L.vehicle : r.transport === "flight" ? L.kinds.flight : r.transport}</td>
                    <td className="px-1.5 py-1 font-semibold tabular-nums text-emerald-700">{r.afterBreakfast ? L.afterBreakfast : (r.kind === "item" || r.kind === "meeting") && r.keyTime ? r.start : ""}</td>
                    <td className="px-1.5 py-1">
                      {r.kind === "free" && (
                        <>
                          <b>{L.freeDay}</b> <span className="text-slate-500">{L.freeDayNote}</span>
                          {r.tips && r.tips.length > 0 && (
                            <span className="block text-slate-500">
                              {L.suggested}: {r.tips.map((x) => t(x)).join(" / ")}
                            </span>
                          )}
                        </>
                      )}
                      {r.kind === "meeting" && <span className="font-medium">{L.hotelMeeting}</span>}
                      {r.kind === "label" && <b className="text-slate-700">{r.key === "rest-late" ? L.morningFree : r.label?.startsWith("오전") ? L.morning : L.afternoon}</b>}
                      {r.kind === "move" && (
                        <span className="text-slate-400">
                          ↓ {r.moveName ? t(r.moveName) : vehicle ? L.vehicle : L.transfer}
                          {r.minutes ? ` ${L.approx(dur(r.minutes))}` : ""}
                        </span>
                      )}
                      {r.kind === "item" && r.item && (
                        <>
                          {itemCell(r.item)}
                          {r.returnFlight && <span className="block text-slate-500">{L.returnFlight}</span>}
                        </>
                      )}
                    </td>
                    {i === 0 && (
                      <td rowSpan={span} className="px-1.5 py-1 text-[10px] leading-4 text-slate-700">
                        <span className="block">
                          {L.mealPrefix[0]}: {foreignMeal(lang, meals.breakfast, "breakfast", table.flightDay, full, t)}
                        </span>
                        <span className="block">
                          {L.mealPrefix[1]}: {foreignMeal(lang, meals.lunch, "lunch", table.flightDay, full, t)}
                        </span>
                        <span className="block">
                          {L.mealPrefix[2]}: {foreignMeal(lang, meals.dinner, "dinner", table.flightDay, full, t)}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
                {table.overnight && (
                  <tr>
                    <td colSpan={3} className="px-1.5 py-1 text-slate-700">
                      {L.hotelLine(table.overnight.hotel ? t(table.overnight.hotel) : L.hotelIn(t(table.overnight.city)))}
                      {gradeLabel ? ` (${gradeLabel})` : ""}
                      <span className="text-slate-400"> · {L.checkInOut}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
        <p className="mt-1.5 text-[10px] text-slate-600">{L.changeNote}</p>
        <p className="text-[10px] text-slate-500">{L.legend}</p>
      </Section>

      <Section title={L.incExc} color={accent}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <h3 className="font-bold text-emerald-900">{L.included}</h3>
            <p>{included.map(t).join(", ") || "-"}</p>
          </div>
          <div>
            <h3 className="font-bold text-slate-700">{L.notIncluded}</h3>
            <p>{[...excluded.map(t), ...(single ? [L.single(money(single.price))] : [])].join(", ") || "-"}</p>
          </div>
        </div>
      </Section>

      <Section title={L.tips} color={accent}>
        <p>{input.tipPerPerson > 0 ? L.tipsIncluded(money(input.tipPerPerson)) : L.tipsLocal}</p>
      </Section>

      <Section title={L.shopping} color={accent}>
        {shops.length === 0 ? (
          <p>{L.noShopping}</p>
        ) : (
          <>
            <p>{L.shops(shops.length)}</p>
            <ul className="list-disc pl-5">
              {shops.map((s) => (
                <li key={`${s.day}-${s.name}`}>
                  {L.dayN(s.day)}: {t(s.name)}
                  {s.goods && ` — ${t(s.goods)}`}
                  {s.minutes > 0 && ` (${L.approx(dur(s.minutes))})`}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={L.options} color={accent}>
        {input.options.length === 0 ? (
          <p>{L.noOptions}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 text-left">
                <th className="w-14 px-2 py-1 font-medium">{L.optCols[0]}</th>
                <th className="px-2 py-1 font-medium">{L.optCols[1]}</th>
                <th className="w-24 px-2 py-1 text-right font-medium">{L.optCols[2]}</th>
                <th className="px-2 py-1 font-medium">{L.optCols[3]}</th>
              </tr>
            </thead>
            <tbody>
              {input.options.map((o) => (
                <tr key={o.id} className="border-b border-slate-200 align-top">
                  <td className="px-2 py-1">{o.dayNo > 0 ? L.dayN(o.dayNo) : "-"}</td>
                  <td className="px-2 py-1">
                    {t(o.name)}
                    {o.durationMinutes > 0 && <span className="text-slate-500"> ({L.approx(dur(o.durationMinutes))})</span>}
                    <span className="block text-[10px] text-slate-500">{L.optRuns(o.minParticipants)}</span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(o.pricePerPerson)}</td>
                  <td className="px-2 py-1 text-slate-600">{o.alternative?.trim() ? t(o.alternative) : L.optDefaultAlt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {info.length > 0 && (
        <Section title={L.info} color={accent}>
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

      <Section title={L.cancel} color={accent}>
        <p className="text-slate-600">{L.cancelIntro}</p>
        <ul className="list-disc pl-5 text-slate-700">
          {L.cancelTerms.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Section>

      <footer className="mt-6 border-t border-slate-300 pt-3 text-[10px] leading-4 text-slate-600">
        <p>{L.footer}</p>
        {(company.phone || company.email || company.emergencyContact.trim()) && (
          <p className="mt-1">
            {L.contact}: {[company.phone, company.email, company.emergencyContact.trim() && `${L.emergency} ${company.emergencyContact.trim()}`].filter(Boolean).join(" · ")}
          </p>
        )}
      </footer>
    </article>
  );
}
