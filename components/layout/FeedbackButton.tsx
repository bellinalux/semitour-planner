"use client";

import { MessageSquarePlus, X } from "lucide-react";
import { useRef, useState } from "react";

/** 상단 [의견] — 쓰다가 불편한 점·바라는 점을 바로 남긴다. 관리자는 "계정·직원 관리"에서 모아 본다 */
export function FeedbackButton({ where }: { where: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const send = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, where }) });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? "보내지 못했습니다.");
      setText("");
      setNotice({ kind: "ok", text: "보냈습니다. 고맙습니다!" });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "보내지 못했습니다." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNotice(null);
          dialogRef.current?.showModal();
        }}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        aria-haspopup="dialog"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
        <span>의견</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="feedback-title"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="space-y-3 p-4 text-xs">
          <div className="flex items-center justify-between">
            <h2 id="feedback-title" className="text-sm font-semibold text-slate-900">
              의견 보내기
            </h2>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="text-[11px] leading-4 text-slate-500">불편한 점, 매번 다시 입력하는 값, 안 쓰는 설정 등을 적어 주세요. 관리자가 모아서 화면을 줄이는 데 씁니다.</p>
          <textarea
            value={text}
            maxLength={1000}
            rows={5}
            onChange={(e) => setText(e.target.value)}
            placeholder="예: 판매 채널은 한 번 정하면 안 바꾸는데 매번 보입니다"
            className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
          />
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || !text.trim()} onClick={() => void send()} className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300">
              {busy ? "보내는 중..." : "보내기"}
            </button>
            {notice && <span className={notice.kind === "error" ? "text-red-600" : "text-emerald-700"}>{notice.text}</span>}
          </div>
        </div>
      </dialog>
    </>
  );
}
