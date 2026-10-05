"use client";

/** 화면 오류 — 흰 화면 대신 안내와 [다시 시도]. 오류는 오류 기록으로 보낸다 */
import { useEffect } from "react";
import { reportError } from "@/lib/errorReport";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportError("react", error, error.digest ? `digest ${error.digest}` : "");
  }, [error]);
  return (
    <div className="flex h-dvh items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-base font-bold text-slate-900">화면을 그리다 오류가 났습니다</h2>
        <p className="mt-2 text-sm text-slate-600">입력하신 내용은 이 브라우저에 저장돼 있습니다. [다시 시도]를 눌러 보고, 계속되면 새로고침해 주세요. 오류 내용은 관리자에게 자동으로 전달됐습니다.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={() => retry()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">다시 시도</button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">새로고침</button>
        </div>
      </div>
    </div>
  );
}
