"use client";

import { Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { postJson } from "@/lib/api";
import type { SharedItinerary } from "@/lib/shareItinerary";

const LINKS_KEY = "semitour-planner:shareLinks";

function readLinks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LINKS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function saveLink(key: string, id: string) {
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify({ ...readLinks(), [key]: id }));
  } catch {
    /* 저장 못 하면 다음에 새 링크 */
  }
}

interface Props {
  /** 지금 견적으로 만든 고객용 일정표 (견적 전이면 null) */
  build: (showPrice: boolean) => SharedItinerary | null;
  /** 같은 상품이면 같은 링크를 고치도록 하는 이름 */
  planKey: string;
}

/**
 * 고객용 웹 일정표 링크 — 휴대폰으로 보는 일정·포함 사항·문의 버튼 페이지를 링크 하나로 공유한다(카톡에 PDF 대신 링크).
 * 같은 상품은 같은 링크에 다시 올려 내용만 바꾼다. 원가·마진·업체 정보는 들어가지 않는다.
 */
export function ShareLinkBox({ build, planKey }: Props) {
  const [showPrice, setShowPrice] = useState(true);
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; url?: string; message?: string; updated?: boolean }>({ status: "idle" });

  const publish = async () => {
    const itinerary = build(showPrice);
    if (!itinerary) return;
    setState({ status: "loading" });
    const prev = readLinks()[planKey];
    try {
      const res = await postJson<{ id: string; path: string }>("/api/share", { ...(prev ? { id: prev } : {}), itinerary });
      saveLink(planKey, res.id);
      setState({ status: "done", url: `${window.location.origin}${res.path}`, updated: !!prev });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "링크를 만들지 못했습니다." });
    }
  };

  const disabled = build(showPrice) === null;
  return (
    <section aria-label="고객용 웹 일정표" className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-slate-800">고객용 웹 일정표 링크</p>
        <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
          <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
          1인 요금 보이기
        </label>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={disabled || state.status === "loading"}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
          {readLinks()[planKey] ? "링크 내용 고치기" : "링크 만들기"}
        </button>
      </div>
      <p className="text-pretty text-[11px] text-slate-500">휴대폰에서 보는 일정·포함 사항·전화/메일 문의 버튼 페이지입니다. 일정을 고친 뒤 다시 누르면 같은 링크의 내용이 바뀝니다 (180일 보관, 검색 노출 안 됨).</p>
      {state.status === "done" && state.url && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 px-2.5 py-2 text-emerald-900">
          <span className="min-w-0 flex-1 truncate">
            {state.updated ? "같은 링크의 내용을 바꿨습니다: " : "링크를 만들었습니다: "}
            <a href={state.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
              {state.url}
            </a>
          </span>
          <CopyButton label="링크 복사" variant="secondary" disabled={false} getText={() => state.url ?? ""} />
        </div>
      )}
      {state.status === "error" && <p className="text-red-600">{state.message}</p>}
    </section>
  );
}
