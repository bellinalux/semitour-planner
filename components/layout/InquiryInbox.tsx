"use client";

import { Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { inquiryDate, STYLE_LABEL, type Inquiry } from "@/lib/inquiry";
import type { TripInput } from "@/types";

interface Props {
  /** 대화상자를 열 때마다 바뀌는 값 (다시 불러오기) */
  openSignal: number;
  companyName: string;
  onMakeBooking: (q: Inquiry) => Promise<string | null>;
  onFillInput: (patch: Partial<TripInput>) => void;
}

/**
 * 웹 견적 요청함 — 고객이 견적 요청 페이지(/q)로 남긴 문의를 보고, 예약(문의)으로 만들거나 이 조건으로 입력을 채워 바로 견적을 만든다.
 */
export function InquiryInbox({ openSignal, companyName, onMakeBooking, onFillInput }: Props) {
  const [list, setList] = useState<Inquiry[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/inquiry")
      .then((r) => (r.ok ? (r.json() as Promise<{ inquiries: Inquiry[] }>) : { inquiries: [] }))
      .then((j) => {
        if (alive) setList(j.inquiries);
      })
      .catch(() => {
        if (alive) setList([]);
      });
    return () => {
      alive = false;
    };
  }, [openSignal]);

  const mark = async (id: string, done: boolean) => {
    const r = await fetch("/api/inquiry", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, done }) }).catch(() => null);
    if (r?.ok) setList(((await r.json()) as { inquiries: Inquiry[] }).inquiries);
  };

  const pageUrl = typeof window === "undefined" ? "" : `${window.location.origin}/q${companyName ? `?c=${encodeURIComponent(companyName)}` : ""}`;
  const open = (list ?? []).filter((q) => !q.done);
  const shown = showDone ? (list ?? []) : open;
  return (
    <section aria-label="웹 견적 요청" className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Inbox className="h-4 w-4 text-indigo-600" aria-hidden />
        <b className="text-slate-800">웹 견적 요청</b>
        {open.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">새 요청 {open.length}건</span>}
        <span className="ml-auto flex items-center gap-2">
          <CopyButton label="요청 페이지 링크 복사" variant="secondary" disabled={!pageUrl} getText={() => pageUrl} />
          <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            처리한 것도 보기
          </label>
        </span>
      </div>
      {list === null ? (
        <p className="text-slate-400">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="text-slate-500">새 요청이 없습니다. 요청 페이지 링크를 홈페이지·카톡 채널에 걸어 두세요.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((q) => (
            <li key={q.id} className={`space-y-1 py-2 ${q.done ? "opacity-60" : ""}`}>
              <p>
                <b>{q.name}</b> <span className="text-slate-500">{q.contact}</span>
                <span className="ml-2 text-[11px] text-slate-400">{new Date(q.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </p>
              <p className="text-slate-700">
                {q.destination} · {q.departure || "출발일 미정"}
                {q.nights > 0 ? ` · ${q.nights}박` : ""} · {q.travelers}명{q.budget > 0 ? ` · 1인 ${q.budget.toLocaleString("ko-KR")}원` : ""} · {STYLE_LABEL[q.style]}
              </p>
              {q.source?.kind === "share" && (
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-800">웹 일정표 예약 요청</span>
                  <a href={`/t/${q.source.shareId}`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline underline-offset-2">
                    {q.source.title}
                  </a>
                  {q.source.period && <span className="text-slate-500">{q.source.period}</span>}
                  {q.source.options.length > 0 && <span className="text-slate-600">· 선택관광 {q.source.options.join(", ")}</span>}
                </p>
              )}
              {q.requests && <p className="text-pretty text-slate-500">“{q.requests}”</p>}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onFillInput({
                      destination: q.destination,
                      travelers: q.travelers,
                      customerName: q.name,
                      ...(inquiryDate(q.departure) ? { departureDate: inquiryDate(q.departure) } : {}),
                      ...(q.nights > 0 ? { nights: q.nights, days: q.nights + 1 } : {}),
                    });
                  }}
                  className="rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700"
                >
                  입력에 채우기
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const err = await onMakeBooking(q);
                    setMessage(err ?? `${q.name} — 예약(문의)으로 만들었습니다.`);
                    if (!err) void mark(q.id, true);
                  }}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                >
                  예약(문의)으로 만들기
                </button>
                <button type="button" onClick={() => void mark(q.id, !q.done)} className="rounded-md px-2 py-1 text-slate-500 underline">
                  {q.done ? "다시 열기" : "처리 완료"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p role="status" className="text-emerald-700">
          {message}
        </p>
      )}
    </section>
  );
}
