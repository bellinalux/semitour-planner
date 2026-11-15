import type { Metadata } from "next";
import Link from "next/link";
import { placeScore } from "@/lib/knowledge";
import { getCity } from "@/lib/server/knowledgeStore";
import { popularPlaces } from "@/lib/server/publicPlan";

/**
 * 지역별 코스 가이드 (공개) — "후쿠오카 추천 코스": 지식 창고의 인기 코스 묶음·많이 찾는 장소·고객이 많이 고른 곳.
 * [이 코스로 내 일정 만들기]가 고객용 코스 만들기(/plan)로 이어진다. 검색에 노출된다.
 */
export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const city = decodeURIComponent((await params).city).slice(0, 40);
  return { title: `${city} 추천 여행 코스`, description: `${city} 여행 추천 코스와 많이 찾는 장소, 내 일정 만들기` };
}

export default async function GuideCity({ params }: { params: Promise<{ city: string }> }) {
  const city = decodeURIComponent((await params).city).slice(0, 40);
  const [doc, popular] = await Promise.all([getCity(city).catch(() => null), popularPlaces(city, 10).catch(() => [])]);
  const top = (doc?.places ?? []).filter((p) => ["sight", "activity", "shopping", "night"].includes(p.kind)).sort((a, b) => placeScore(b) - placeScore(a)).slice(0, 12);
  const courses = (doc?.courses ?? []).slice().sort((a, b) => b.popularity - a.popularity).slice(0, 6);
  const plan = (places: string[]) => `/plan?dest=${encodeURIComponent(city)}${places.length ? "" : ""}`;
  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-5 bg-white px-4 py-8 text-sm text-slate-800">
      <header className="space-y-1">
        <Link href="/guide" className="text-xs text-indigo-700 underline">
          여행지 목록
        </Link>
        <h1 className="text-xl font-bold text-slate-900">{city} 추천 여행 코스</h1>
        <p className="text-slate-600">여행사들이 많이 넣는 곳과 여행자 후기를 모아 정리했습니다. 마음에 드는 코스로 내 일정을 바로 만들어 보세요.</p>
      </header>
      {courses.length > 0 && (
        <section aria-label="추천 코스" className="space-y-2">
          <h2 className="font-semibold text-slate-900">추천 코스</h2>
          {courses.map((c) => (
            <article key={c.key} className="space-y-1 rounded-xl border border-slate-200 p-3">
              <h3 className="font-semibold text-slate-900">{c.name}</h3>
              <p className="text-slate-700">{c.places.join(" → ")}</p>
              {c.note && <p className="text-xs text-slate-500">{c.note}</p>}
            </article>
          ))}
        </section>
      )}
      {top.length > 0 && (
        <section aria-label="많이 찾는 장소" className="space-y-2">
          <h2 className="font-semibold text-slate-900">많이 찾는 장소</h2>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {top.map((p) => (
              <li key={p.key} className="rounded-lg bg-slate-50 px-3 py-2">
                <b className="text-slate-900">{p.name}</b>
                {p.area && <span className="ml-1 text-xs text-slate-500">{p.area}</span>}
                {p.likes[0] && <span className="block text-xs text-slate-600">{p.likes[0]}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {popular.some((p) => p.count > 0) && (
        <p className="text-xs text-slate-600">우리 고객들이 많이 고른 곳: {popular.filter((p) => p.count > 0).map((p) => p.name).join(", ")}</p>
      )}
      {!doc?.places.length && <p className="text-slate-500">이 여행지는 준비 중입니다. 내 일정 만들기로 바로 코스를 받아 보세요.</p>}
      <Link href={plan([])} className="inline-block rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white">
        {city} 내 여행 코스 만들기
      </Link>
    </main>
  );
}
