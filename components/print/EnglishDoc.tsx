import { computeItemTimings, dayMeetingTime } from "@/lib/dayLoad";
import { includeLists } from "@/lib/documents";
import { docTitle, englishDate, englishDayDate, englishMoney, englishPeriod } from "@/lib/englishDoc";
import { localPayRows } from "@/lib/fees";
import { dayItems } from "@/lib/itinerary";
import type { DocProps } from "./DocShell";

const KIND: Record<string, string> = {
  sightseeing: "Sightseeing",
  experience: "Activity",
  massage: "Spa",
  shopping: "Shopping",
  meal: "Meal",
  transfer: "Transfer",
  hotel: "Hotel",
  free_time: "Free time",
  flight: "Flight",
};

/**
 * 영문 일정표·견적서 (Itinerary & Quotation) — 외국인 고객용. 한글 글은 번역표(translations)로 바꾸고, 없으면 원문을 둔다.
 * 원가·마진은 넣지 않는다.
 */
export function EnglishDoc({ input, days, pmChoice, quote, meta, company, translations = {} }: DocProps) {
  const t = (s: string | undefined | null) => {
    const k = (s ?? "").trim();
    return translations[k] ?? translations[k.slice(0, 400)] ?? k;
  };
  const price = quote.partnerConsumerPrice ?? quote.scenario.pricePerPerson;
  const { included, excluded } = includeLists(quote, input, localPayRows(days, pmChoice).rows.length > 0);
  const title = t(docTitle({ input, meta }));

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
      </section>

      <section className="mt-4 break-inside-avoid">
        <h2 className="mb-1 border-b border-emerald-200 pb-0.5 text-sm font-bold text-emerald-900">Price</h2>
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
      </section>

      <section className="mt-4 space-y-3">
        <h2 className="border-b border-emerald-200 pb-0.5 text-sm font-bold text-emerald-900">Day-by-day itinerary</h2>
        {days.map((d) => {
          const items = dayItems(d, pmChoice);
          const timings = computeItemTimings(items, dayMeetingTime(d));
          const date = englishDayDate(input, d.day);
          const hotel = d.overnightCity ? (input.selectedHotels[d.overnightCity.trim()]?.name ?? d.overnightCity) : "";
          return (
            <div key={d.day} className="break-inside-avoid">
              <p className="font-semibold text-emerald-900">
                Day {d.day}
                {date && <span className="ml-1.5 font-normal text-slate-500">{date}</span>}
                {d.theme && <span className="ml-1.5 font-normal text-slate-700">— {t(d.theme)}</span>}
              </p>
              <table className="mt-1 w-full border-collapse text-[10.5px]">
                <tbody>
                  {items.map((it) => {
                    const tm = timings.get(it.id);
                    return (
                      <tr key={it.id} className="border-b border-slate-100 align-top">
                        <td className="w-14 px-1.5 py-1 tabular-nums text-slate-500">{tm?.start ?? ""}</td>
                        <td className="w-20 px-1.5 py-1 text-slate-500">{KIND[it.type ?? "sightseeing"] ?? ""}</td>
                        <td className="px-1.5 py-1">
                          <span className="font-medium">{t(it.name)}</span>
                          {it.description && <span className="block text-slate-500">{t(it.description.slice(0, 160))}</span>}
                          {it.payment === "local" && <span className="block text-amber-700">Paid locally by guest</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hotel && <p className="mt-0.5 text-slate-500">Overnight: {t(hotel)}</p>}
            </div>
          );
        })}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 break-inside-avoid">
        <div>
          <h2 className="font-bold text-emerald-900">Included</h2>
          <p>{included.map(t).join(", ") || "-"}</p>
        </div>
        <div>
          <h2 className="font-bold text-slate-700">Not included</h2>
          <p>{excluded.map(t).join(", ") || "-"}</p>
        </div>
      </section>

      <footer className="mt-6 border-t border-slate-300 pt-3 text-[10px] leading-4 text-slate-600">
        <p>The order and times may change due to local traffic, weather or opening hours. Prices are subject to availability at the time of booking.</p>
        {(company.phone || company.email) && (
          <p className="mt-1">
            Contact: {[company.phone, company.email].filter(Boolean).join(" · ")}
          </p>
        )}
      </footer>
    </article>
  );
}
