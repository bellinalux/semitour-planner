import type { Metadata } from "next";
import { getShared } from "@/lib/server/shareStore";
import type { SharedItinerary } from "@/lib/shareItinerary";

/** 고객용 웹 일정표 (링크로 보는 공개 화면) — 접근 코드 없이 열리고, 원가·업체 정보는 들어 있지 않다 */

export const metadata: Metadata = { title: "여행 일정표", robots: { index: false, follow: false } };

const KIND_MARK: Record<SharedItinerary["days"][number]["items"][number]["kind"], string> = {
  sight: "관광",
  meal: "식사",
  move: "이동",
  hotel: "숙소",
  free: "자유",
  flight: "항공",
  other: "",
};

export default async function SharedItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getShared(id).catch(() => null);
  if (!it) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-slate-600">
        <h1 className="text-base font-semibold text-slate-900">일정표를 찾을 수 없습니다</h1>
        <p className="mt-2">링크가 만료되었거나 잘못되었습니다. 담당자에게 새 링크를 요청해 주세요.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-xl space-y-5 bg-white px-4 pb-24 pt-6 text-sm text-slate-800">
      <header className="space-y-1">
        {it.company.name && <p className="text-xs font-semibold text-indigo-700">{it.company.name}</p>}
        <h1 className="text-balance text-xl font-bold text-slate-900">{it.title}</h1>
        <p className="text-slate-600">
          {it.period}
          {it.travelers > 0 && ` · ${it.travelers}명`}
        </p>
        {it.priceLine && <p className="text-base font-semibold text-indigo-800">{it.priceLine}</p>}
      </header>

      <section aria-label="날짜별 일정" className="space-y-4">
        {it.days.map((d) => (
          <article key={d.day} className="rounded-xl border border-slate-200 p-3">
            <h2 className="font-semibold text-slate-900">
              DAY {d.day}
              {d.date && <span className="ml-1.5 font-normal text-slate-500">{d.date}</span>}
            </h2>
            {d.theme && <p className="text-pretty text-xs text-slate-500">{d.theme}</p>}
            <ol className="mt-2 space-y-1.5">
              {d.items.map((item, i) => (
                <li key={`${d.day}-${i}`} className="flex gap-2">
                  <span className="w-11 shrink-0 tabular-nums text-xs text-slate-400">{item.time}</span>
                  <span className="min-w-0">
                    {KIND_MARK[item.kind] && <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">{KIND_MARK[item.kind]}</span>}
                    <span className="font-medium">{item.name}</span>
                    {item.note && <span className="block text-pretty text-xs text-slate-500">{item.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {d.hotel && <p className="mt-2 text-xs text-slate-500">숙박: {d.hotel}</p>}
          </article>
        ))}
      </section>

      <section aria-label="포함 사항" className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
        <p>
          <b className="text-emerald-800">포함</b> {it.included.join(", ") || "-"}
        </p>
        <p>
          <b className="text-slate-700">불포함</b> {it.excluded.join(", ") || "-"}
        </p>
        {it.notices.map((n) => (
          <p key={n} className="text-pretty text-slate-500">
            · {n}
          </p>
        ))}
      </section>

      <p className="text-center text-[11px] text-slate-400">마지막 수정 {it.updatedAt.slice(0, 10)}</p>

      {(it.company.phone || it.company.email) && (
        <nav aria-label="문의" className="fixed inset-x-0 bottom-0 flex gap-2 border-t border-slate-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {it.company.phone && (
            <a href={`tel:${it.company.phone.replace(/[^\d+]/g, "")}`} className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-center text-sm font-semibold text-white">
              전화 문의
            </a>
          )}
          {it.company.email && (
            <a href={`mailto:${it.company.email}?subject=${encodeURIComponent(`[문의] ${it.title}`)}`} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-center text-sm font-semibold text-slate-700">
              메일 문의
            </a>
          )}
        </nav>
      )}
    </main>
  );
}
