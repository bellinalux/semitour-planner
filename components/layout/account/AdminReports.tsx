"use client";

import { useEffect, useState } from "react";
import { AUTO_STEP_LABELS } from "@/hooks/useAutoQuote";
import { summarizePerf, type PerfEntry } from "@/lib/perf";
import { when } from "./shared";

interface AuditView {
  at: string;
  who: string;
  action: string;
  target: string;
}

interface FeedbackView {
  id: string;
  at: string;
  author: string;
  text: string;
  where: string;
}

async function getList<T>(url: string, key: string): Promise<T[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return ((await res.json()) as Record<string, T[]>)[key] ?? [];
  } catch {
    return [];
  }
}

/**
 * 관리자: 열람·변경 기록, 속도 기록(실제 사용 기준), 직원 의견.
 * openSignal이 바뀔 때(계정 창을 열 때)마다 다시 읽는다.
 */
export function AdminReports({ openSignal }: { openSignal: number }) {
  const [auditLog, setAuditLog] = useState<AuditView[] | null>(null);
  const [perf, setPerf] = useState<PerfEntry[] | null>(null);
  const [feedback, setFeedback] = useState<FeedbackView[] | null>(null);

  useEffect(() => {
    if (openSignal === 0) return;
    let cancelled = false;
    void Promise.all([getList<AuditView>("/api/audit", "audit"), getList<PerfEntry>("/api/perf", "perf"), getList<FeedbackView>("/api/feedback", "feedback")]).then(([a, p, f]) => {
      if (cancelled) return;
      setAuditLog(a);
      setPerf(p.slice(0, 50));
      setFeedback(f);
    });
    return () => {
      cancelled = true;
    };
  }, [openSignal]);

  return (
    <>
      {auditLog && (
        <section aria-label="열람·변경 기록" className="space-y-2 border-t border-slate-100 pt-3">
          <h3 className="font-semibold text-slate-700">열람·변경 기록 (최근 {Math.min(auditLog.length, 200)}건)</h3>
          <p className="text-[11px] leading-4 text-slate-500">
            고객 정보(예약) 열람·수정, 직원 계정·회사 정보 변경, 로그인을 남깁니다. 같은 사람의 예약 목록 열람은 10분에 한 번만 남깁니다.
          </p>
          {auditLog.length === 0 ? (
            <p className="text-[11px] text-slate-500">아직 기록이 없습니다.</p>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto text-[11px] text-slate-600">
              {auditLog.map((a, i) => (
                <li key={`${a.at}-${i}`} className={a.action === "로그인 실패" ? "text-rose-600" : ""}>
                  <span className="tabular-nums text-slate-400">{when(a.at)}</span> · {a.who} · {a.action}
                  {a.target ? ` · ${a.target}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {perf && (
        <section aria-label="속도 기록" className="space-y-2 border-t border-slate-100 pt-3">
          <h3 className="font-semibold text-slate-700">속도 기록 (최근 {perf.length}회, 실제 사용 기준)</h3>
          {perf.length === 0 ? (
            <p className="text-[11px] text-slate-500">아직 기록이 없습니다. 직원이 코스를 만들거나 자동 견적을 돌리면 걸린 시간이 쌓입니다.</p>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 font-medium">작업</th>
                  <th className="py-1 text-right font-medium">횟수</th>
                  <th className="py-1 text-right font-medium">보통</th>
                  <th className="py-1 text-right font-medium">느릴 때</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums text-slate-700">
                {summarizePerf(perf, AUTO_STEP_LABELS).map((r) => (
                  <tr key={r.label}>
                    <td className="py-1">{r.label}</td>
                    <td className="py-1 text-right">{r.count}</td>
                    <td className="py-1 text-right">{Math.round(r.medianMs / 1000)}초</td>
                    <td className="py-1 text-right">{Math.round(r.p90Ms / 1000)}초</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section aria-label="직원 의견" className="space-y-2 border-t border-slate-100 pt-3">
        <h3 className="font-semibold text-slate-700">직원 의견 {feedback ? `(${feedback.length})` : ""}</h3>
        {feedback === null ? null : feedback.length === 0 ? (
          <p className="text-[11px] text-slate-500">아직 받은 의견이 없습니다. 직원은 화면 위 [의견] 버튼으로 남길 수 있습니다.</p>
        ) : (
          <ul className="max-h-60 space-y-1.5 overflow-y-auto">
            {feedback.map((f) => (
              <li key={f.id} className="rounded-md bg-slate-50 px-2.5 py-2">
                <p className="text-[11px] text-slate-400">
                  {when(f.at)} · {f.author}
                  {f.where ? ` · ${f.where}` : ""}
                </p>
                <p className="whitespace-pre-wrap text-slate-700">{f.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
