import type { Metadata } from "next";
import { getGuideSheet, getGuideState } from "@/lib/server/guideStore";
import { GuideView } from "./GuideView";

/** 가이드용 운영 페이지 (링크로 여는 화면) — 가격 정보 없음, 진행 체크·현장 기록 */

export const metadata: Metadata = { title: "운영 지시서 (가이드)", robots: { index: false, follow: false } };

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sheet = await getGuideSheet(id).catch(() => null);
  if (!sheet) {
    return (
      <main className="mx-auto min-h-dvh max-w-xl px-4 py-16 text-center text-sm text-slate-600">
        <h1 className="text-base font-semibold text-slate-900">운영 페이지를 찾을 수 없습니다</h1>
        <p className="mt-2">링크가 만료되었거나 잘못되었습니다. 담당자에게 새 링크를 요청해 주세요.</p>
      </main>
    );
  }
  const state = await getGuideState(id);
  return <GuideView id={id} sheet={sheet} initial={state} />;
}
