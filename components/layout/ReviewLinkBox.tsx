"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { postJson } from "@/lib/api";
import { reviewIdsIn, SCORE_LABELS, type ReviewSummary } from "@/lib/reviews";

/** 후기 요약 (링크 아이디들) */
export function useReviewSummaries(ids: string[]): ReviewSummary[] {
  const key = [...new Set(ids)].sort().join(",");
  const [state, setState] = useState<{ key: string; list: ReviewSummary[] }>({ key: "", list: [] });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetch(`/api/review-link?ids=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ summaries: ReviewSummary[] }>) : { summaries: [] }))
      .then((j) => {
        if (alive) setState({ key, list: j.summaries });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  return state.key === key ? state.list : [];
}

/**
 * 예약 편집의 고객 만족도 — 귀국 뒤 보낼 후기 링크를 만들어 메모에 남기고(팀이 함께 봄), 받은 별점·항목 점수·한마디를 보여 준다.
 */
export function ReviewLinkBox({ memo, title, planName, company, onAppendMemo }: { memo: string; title: string; planName: string; company: string; onAppendMemo: (line: string) => void }) {
  const ids = reviewIdsIn(memo);
  const summaries = useReviewSummaries(ids);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ path: string }>("/api/review-link", { title: title || "여행 후기", planName, company });
      onAppendMemo(`후기 링크: ${window.location.origin}${r.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "링크를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  const url = ids.length > 0 ? `${typeof window === "undefined" ? "" : window.location.origin}/r/${ids[ids.length - 1]}` : "";
  return (
    <div className="space-y-1.5 rounded-md bg-white p-2.5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <Star className="h-3.5 w-3.5 text-amber-500" aria-hidden />
        <span className="font-semibold text-slate-700">고객 만족도</span>
        {ids.length === 0 ? (
          <button type="button" disabled={busy} onClick={() => void create()} className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
            후기 링크 만들기
          </button>
        ) : (
          <CopyButton label="후기 링크 복사" variant="secondary" disabled={false} getText={() => url} />
        )}
        {error && <span className="text-red-600">{error}</span>}
      </div>
      {summaries.map((s) => (
        <div key={s.id} className="text-[11px] text-slate-600">
          {s.count === 0 ? (
            "아직 받은 후기가 없습니다. 귀국 뒤 고객에게 링크를 보내 주세요."
          ) : (
            <>
              <b className="text-amber-700">★ {s.average}</b> ({s.count}건)
              {Object.entries(s.scores).map(([k, v]) => ` · ${SCORE_LABELS[k as keyof typeof SCORE_LABELS]} ${v}`)}
              {s.comments.map((c) => (
                <span key={c.at} className="block text-pretty text-slate-500">
                  “{c.comment}” {c.name && `— ${c.name}`}
                </span>
              ))}
            </>
          )}
        </div>
      ))}
      {ids.length === 0 && <p className="text-[10px] text-slate-400">링크는 메모에 남겨 팀이 함께 봅니다. 고객 이름은 선택이고 연락처는 받지 않습니다.</p>}
    </div>
  );
}
