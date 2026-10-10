import type { Metadata } from "next";
import { getShared } from "@/lib/server/shareStore";
import type { SharedItinerary } from "@/lib/shareItinerary";

/** 고객용 웹 일정표 (링크로 보는 공개 화면) — 접근 코드 없이 열리고, 원가·업체 정보는 들어 있지 않다 */

export const metadata: Metadata = { title: "여행 일정표", robots: { index: false, follow: false } };

type Kind = SharedItinerary["days"][number]["items"][number]["kind"];
const KIND_MARK: Record<"ko" | "en", Record<Kind, string>> = {
  ko: { sight: "관광", meal: "식사", move: "이동", hotel: "숙소", free: "자유", flight: "항공", other: "" },
  en: { sight: "Sight", meal: "Meal", move: "Transfer", hotel: "Hotel", free: "Free", flight: "Flight", other: "" },
};
const TEXT = {
  ko: { travelers: (n: number) => `${n}명`, stay: "숙박", inc: "포함", exc: "불포함", updated: "마지막 수정", call: "전화 문의", mail: "메일 문의", subject: "[문의]", days: "날짜별 일정", incl: "포함 사항" },
  en: { travelers: (n: number) => `${n} travelers`, stay: "Overnight", inc: "Included", exc: "Not included", updated: "Last updated", call: "Call us", mail: "Email us", subject: "[Inquiry]", days: "Day-by-day itinerary", incl: "Inclusions" },
};

export default async function SharedItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getShared(id).catch(() => null);
  if (!it) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-slate-600">
        <h1 className="text-base font-semibold text-slate-900">일정표를 찾을 수 없습니다</h1>
        <p className="mt-2">링크가 만료되었거나 잘못되었습니다. 담당자에게 새 링크를 요청해 주세요.</p>
        <p className="mt-1 text-xs text-slate-400">This itinerary link has expired or is invalid.</p>
      </main>
    );
  }
  const lang = it.lang ?? "ko";
  const t = TEXT[lang];
  return (
    <main lang={lang} className="mx-auto min-h-dvh max-w-xl space-y-5 bg-white px-4 pb-24 pt-6 text-sm text-slate-800">
      <header className="space-y-1">
        {it.company.name && <p className="text-xs font-semibold text-indigo-700">{it.company.name}</p>}
        <h1 className="text-balance text-xl font-bold text-slate-900">{it.title}</h1>
        <p className="text-slate-600">
          {it.period}
          {it.travelers > 0 && ` · ${t.travelers(it.travelers)}`}
        </p>
        {it.priceLine && <p className="text-base font-semibold text-indigo-800">{it.priceLine}</p>}
        {it.tags.length > 0 && (
          <ul aria-label="상품 조건" className="flex flex-wrap gap-1 pt-1">
            {it.tags.map((tag) => (
              <li key={tag} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </header>

      <section aria-label={t.days} className="space-y-4">
        {it.days.map((d) => (
          <article key={d.day} className="rounded-xl border border-slate-200 p-3">
            <h2 className="font-semibold text-slate-900">
              {lang === "en" ? "Day" : "DAY"} {d.day}
              {d.date && <span className="ml-1.5 font-normal text-slate-500">{d.date}</span>}
            </h2>
            {d.theme && <p className="text-pretty text-xs text-slate-500">{d.theme}</p>}
            <ol className="mt-2 space-y-1.5">
              {d.items.map((item, i) => (
                <li key={`${d.day}-${i}`} className="flex gap-2">
                  <span className="w-11 shrink-0 tabular-nums text-xs text-slate-400">{item.time}</span>
                  <span className="min-w-0">
                    {KIND_MARK[lang][item.kind] && <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">{KIND_MARK[lang][item.kind]}</span>}
                    <span className="font-medium">{item.name}</span>
                    {item.note && <span className="block text-pretty text-xs text-slate-500">{item.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {d.meals && <p className="mt-2 text-xs text-slate-600">🍴 {d.meals}</p>}
            {d.hotel && (
              <p className="mt-2 text-xs text-slate-500">
                {t.stay}: {d.hotel}
              </p>
            )}
          </article>
        ))}
      </section>

      <section aria-label={t.incl} className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
        <p>
          <b className="text-emerald-800">{t.inc}</b> {it.included.join(", ") || "-"}
        </p>
        <p>
          <b className="text-slate-700">{t.exc}</b> {it.excluded.join(", ") || "-"}
        </p>
        {it.notices.map((n) => (
          <p key={n} className="text-pretty text-slate-500">
            · {n}
          </p>
        ))}
      </section>

      <p className="text-center text-[11px] text-slate-400">
        {t.updated} {it.updatedAt.slice(0, 10)}
      </p>

      {(it.company.phone || it.company.email) && (
        <nav aria-label={lang === "en" ? "Contact" : "문의"} className="fixed inset-x-0 bottom-0 flex gap-2 border-t border-slate-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {it.company.phone && (
            <a href={`tel:${it.company.phone.replace(/[^\d+]/g, "")}`} className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-center text-sm font-semibold text-white">
              {t.call}
            </a>
          )}
          {it.company.email && (
            <a href={`mailto:${it.company.email}?subject=${encodeURIComponent(`${t.subject} ${it.title}`)}`} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-center text-sm font-semibold text-slate-700">
              {t.mail}
            </a>
          )}
        </nav>
      )}
    </main>
  );
}
