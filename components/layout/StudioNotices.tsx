"use client";

import { useState } from "react";
import type { useStudioProductProvide } from "@/hooks/useStudioProductProvide";
import type { useStudioProductReceive } from "@/hooks/useStudioProductReceive";

interface Props {
  provide: ReturnType<typeof useStudioProductProvide>;
  /** 지금 일정 이름 (일정이 없으면 빈 문자열) */
  productTitle: string;
  studioNotice: ReturnType<typeof useStudioProductReceive>[0];
  onClearStudioNotice: () => void;
}

/** 상세페이지 스튜디오와 일정을 주고받을 때 입력 패널 위에 띄우는 안내 */
export function StudioNotices({ provide, productTitle, studioNotice, onClearStudioNotice }: Props) {
  const [provideErr, setProvideErr] = useState("");
  return (
    <>
    {provide.state.status !== "idle" && (
      <div role="status" className="m-3 mb-0 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        {provide.state.status === "asked" && (
          <>
            <p>
              상세페이지 스튜디오가 일정을 기다립니다. 보낼 일정을 확인한 뒤(다른 일정은 [저장한 일정]에서 불러오기) 보내기를 누르세요.
              {productTitle ? <> 지금 일정: <b>{productTitle}</b></> : " 지금은 일정이 없습니다."}
            </p>
            {provideErr && <p className="mt-1 text-rose-600">{provideErr}</p>}
            <div className="mt-2 flex gap-1.5">
              <button type="button" onClick={() => setProvideErr(provide.send() ?? "")} className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700">
                상세페이지 스튜디오로 보내기
              </button>
              <button type="button" onClick={provide.dismiss} className="rounded-md px-3 py-1.5 text-indigo-700 hover:bg-indigo-100">
                닫기
              </button>
            </div>
          </>
        )}
        {provide.state.status === "sent" && <p>보내는 중… 상세페이지 스튜디오 창을 확인하세요.</p>}
        {provide.state.status === "done" && (
          <p>
            {provide.state.ok ? "✅ 보냈습니다. 상세페이지 스튜디오 탭으로 가서 [채우기]를 누르세요 (이 창은 닫아도 됩니다)." : `상세페이지 스튜디오가 받지 못했습니다: ${provide.state.message ?? ""}`}{" "}
            <button type="button" onClick={provide.dismiss} className="ml-1 underline">닫기</button>
          </p>
        )}
      </div>
    )}
    {studioNotice && (
      <div role="status" className="m-3 mb-0 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <span className="flex-1">
          상세페이지 스튜디오에서 <b>{studioNotice.title}</b>(코스 {studioNotice.courses}곳)을 받아 입력칸을 채웠습니다. 확인한 뒤 [생성]을 누르세요.
        </span>
        <button type="button" onClick={onClearStudioNotice} className="text-indigo-500 hover:text-indigo-800" aria-label="닫기">
          ✕
        </button>
      </div>
    )}
    </>
  );
}
