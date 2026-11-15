import type { Metadata } from "next";
import { PlanApp } from "@/components/plan/PlanApp";

/** 고객용 "내 여행 코스 만들기" (공개) — 자사몰(카페24)에는 ?embed=1로 넣는다 */
export const metadata: Metadata = { title: "내 여행 코스 만들기", robots: { index: false, follow: false } };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ embed?: string; dest?: string; name?: string; phone?: string }> }) {
  const q = await searchParams;
  return (
    <main className={`min-h-dvh ${q.embed === "1" ? "bg-transparent" : "bg-white"}`}>
      <PlanApp embed={q.embed === "1"} initial={{ dest: (q.dest ?? "").slice(0, 60), name: (q.name ?? "").slice(0, 40), phone: (q.phone ?? "").slice(0, 60) }} />
    </main>
  );
}
