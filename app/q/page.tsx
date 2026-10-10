import type { Metadata } from "next";
import { InquiryForm } from "./InquiryForm";

/** 고객 견적 요청 페이지 (공개) — 여행사 홈페이지·SNS·카톡 채널에 링크로 건다 */

export const metadata: Metadata = { title: "여행 견적 요청", robots: { index: false, follow: false } };

export default async function InquiryPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const company = (c ?? "").slice(0, 40);
  return (
    <main className="mx-auto min-h-dvh max-w-md space-y-4 bg-white px-4 py-8 text-sm text-slate-800">
      <header className="space-y-1">
        {company && <p className="text-xs font-semibold text-indigo-700">{company}</p>}
        <h1 className="text-lg font-bold text-slate-900">여행 견적 요청</h1>
        <p className="text-pretty text-slate-600">가고 싶은 곳과 일정을 남겨 주시면 맞춤 일정과 견적을 보내 드립니다.</p>
      </header>
      <InquiryForm />
      <p className="text-[11px] text-slate-400">남겨 주신 이름·연락처는 견적 상담에만 쓰고, 상담이 끝나면 지웁니다.</p>
    </main>
  );
}
