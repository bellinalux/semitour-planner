import type { Metadata } from "next";
import { reviewLinkInfo } from "@/lib/server/reviewStore";
import { ReviewForm } from "./ReviewForm";

/** 고객 만족도 (링크로 여는 공개 화면) — 별점·항목별 점수·한마디 */

export const metadata: Metadata = { title: "여행 후기", robots: { index: false, follow: false } };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const link = await reviewLinkInfo(id).catch(() => null);
  if (!link) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-600">
        <h1 className="text-base font-semibold text-slate-900">후기 링크를 찾을 수 없습니다</h1>
        <p className="mt-2">링크가 만료되었거나 잘못되었습니다.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto min-h-dvh max-w-md space-y-4 bg-white px-4 py-8 text-sm text-slate-800">
      <header className="space-y-1">
        {link.company && <p className="text-xs font-semibold text-indigo-700">{link.company}</p>}
        <h1 className="text-balance text-lg font-bold text-slate-900">{link.title}</h1>
        <p className="text-pretty text-slate-600">함께해 주셔서 감사합니다. 여행은 어떠셨나요? 남겨 주신 의견은 다음 여행을 더 좋게 만드는 데 씁니다.</p>
      </header>
      <ReviewForm id={id} places={link.places ?? []} />
    </main>
  );
}
