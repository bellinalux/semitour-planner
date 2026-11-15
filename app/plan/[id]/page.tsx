import type { Metadata } from "next";
import Link from "next/link";
import { PlanApp } from "@/components/plan/PlanApp";
import { loadPublicPlan } from "@/lib/server/publicPlan";

/** 저장한 고객 코스 (공유 링크) — 이어서 고치거나 견적을 요청한다 */
export const metadata: Metadata = { title: "내 여행 코스", robots: { index: false, follow: false } };

export default async function SavedPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { id } = await params;
  const { embed } = await searchParams;
  const plan = await loadPublicPlan(id).catch(() => null);
  if (!plan)
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-600">
        <h1 className="text-base font-semibold text-slate-900">코스를 찾을 수 없습니다</h1>
        <p className="mt-2">링크가 만료되었거나(180일) 잘못되었습니다.</p>
        <Link href="/plan" className="mt-4 inline-block text-indigo-700 underline">
          새 코스 만들기
        </Link>
      </main>
    );
  return (
    <main className={`min-h-dvh ${embed === "1" ? "bg-transparent" : "bg-white"}`}>
      <PlanApp embed={embed === "1"} saved={{ id: plan.id, title: plan.title, request: plan.request, days: plan.days }} />
    </main>
  );
}
