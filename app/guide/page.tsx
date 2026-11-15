import type { Metadata } from "next";
import Link from "next/link";
import { listCities } from "@/lib/server/knowledgeStore";

/** 지역별 코스 가이드 목록 (공개) — 지식 창고에 쌓인 도시의 추천 코스. 자사몰에서 링크해 검색 유입·상담으로 잇는다 */
export const metadata: Metadata = { title: "여행지별 추천 코스", description: "여행지별 추천 코스와 많이 찾는 장소" };

export default async function GuideIndex() {
  const cities = (await listCities().catch(() => [])).filter((c) => c.places >= 5).sort((a, b) => b.places - a.places);
  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-4 bg-white px-4 py-8 text-sm text-slate-800">
      <h1 className="text-lg font-bold text-slate-900">여행지별 추천 코스</h1>
      {cities.length === 0 ? (
        <p className="text-slate-500">준비 중입니다.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {cities.map((c) => (
            <li key={c.city}>
              <Link href={`/guide/${encodeURIComponent(c.city)}`} className="block rounded-xl border border-slate-200 p-3 hover:border-indigo-400">
                <b className="text-slate-900">{c.city}</b>
                <span className="block text-xs text-slate-500">
                  추천 장소 {c.places}곳{c.courses ? ` · 추천 코스 ${c.courses}개` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/plan" className="inline-block rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white">
        내 여행 코스 만들기
      </Link>
    </main>
  );
}
