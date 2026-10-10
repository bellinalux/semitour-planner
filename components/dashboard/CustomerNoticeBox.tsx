"use client";

import { Backpack, Loader2, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/lib/clipboard";

interface Props {
  /** 출발 전 안내문 (여행 정보를 찾은 뒤 만든다) */
  buildNotice: () => Promise<string | null>;
  /** 준비물 목록 글 */
  buildPacking: () => Promise<string | null>;
  onPrintPacking: () => void;
}

/**
 * 고객 안내 — 출발 2~3일 전 문자·카톡으로 보내는 안내문(미팅·항공·날씨·전압·입국·준비물·비상연락)과 준비물 체크리스트.
 * 여행 정보(시차·전압·입국)는 웹에서 한 번 찾아 둔 것을 쓴다.
 */
export function CustomerNoticeBox({ buildNotice, buildPacking, onPrintPacking }: Props) {
  const [state, setState] = useState<{ busy: "" | "notice" | "packing"; message: string }>({ busy: "", message: "" });
  const run = async (kind: "notice" | "packing") => {
    setState({ busy: kind, message: "" });
    const text = kind === "notice" ? await buildNotice() : await buildPacking();
    const ok = text ? await copyText(text) : false;
    setState({ busy: "", message: ok ? (kind === "notice" ? "출발 전 안내문을 복사했습니다. 문자·카톡에 붙여 넣으세요." : "준비물 목록을 복사했습니다.") : "복사하지 못했습니다." });
  };
  const button = "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  return (
    <section aria-label="고객 안내" className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm">
      <p className="font-medium text-slate-800">고객 안내 (출발 전)</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={state.busy !== ""} onClick={() => void run("notice")} className={button}>
          {state.busy === "notice" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MessageSquareText className="h-4 w-4 text-slate-400" aria-hidden />}
          출발 전 안내문 복사
        </button>
        <button type="button" disabled={state.busy !== ""} onClick={() => void run("packing")} className={button}>
          {state.busy === "packing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Backpack className="h-4 w-4 text-slate-400" aria-hidden />}
          준비물 목록 복사
        </button>
        <button type="button" onClick={onPrintPacking} className={button}>
          준비물 체크리스트 인쇄
        </button>
      </div>
      <p className="text-pretty text-[11px] text-slate-500">미팅·항공편·날씨·전압·입국 조건·준비물·가이드 경비·비상연락을 한 번에 정리합니다. 여행 정보는 처음 한 번 웹에서 찾습니다 (10~30초).</p>
      {state.message && (
        <p role="status" className="text-emerald-700">
          {state.message}
        </p>
      )}
    </section>
  );
}
