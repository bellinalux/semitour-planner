"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { postJson } from "@/lib/api";
import { fieldReport, fieldStays, type GuideSheet, type GuideState } from "@/lib/guideSheet";

const LINKS_KEY = "semitour-planner:guideLinks";
const readLinks = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(LINKS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
};

/**
 * 가이드 링크·현장 기록 — 운영 지시서를 가이드 휴대폰용 링크로 만들고(같은 상품은 같은 링크), 가이드가 남긴 진행 체크·변경·사고 기록을
 * 불러와 현장 보고서로 복사한다. 명단은 "명단 포함"을 고를 때만 링크에 넣는다.
 */
export function GuideLinkTab({ build, planKey, city = "" }: { build: (withNames: boolean) => GuideSheet | null; planKey: string; city?: string }) {
  const [withNames, setWithNames] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<GuideState | null>(null);
  const id = typeof window === "undefined" ? undefined : readLinks()[planKey];
  const url = id && typeof window !== "undefined" ? `${window.location.origin}/g/${id}` : "";

  const publish = async () => {
    const sheet = build(withNames);
    if (!sheet) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await postJson<{ id: string }>("/api/guide", { ...(id ? { id } : {}), sheet });
      try {
        localStorage.setItem(LINKS_KEY, JSON.stringify({ ...readLinks(), [planKey]: r.id }));
      } catch {
        /* 다음에 새 링크 */
      }
      setMessage(id ? "같은 링크의 일정을 고쳤습니다 (현장 기록은 그대로)." : "가이드 링크를 만들었습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "링크를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const load = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/guide?id=${encodeURIComponent(id)}`);
      if (r.ok) setState((await r.json()) as GuideState);
      else setMessage("현장 기록을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const sheet = build(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={withNames} onChange={(e) => setWithNames(e.target.checked)} />
          명단·객실 포함 (이름·객실·특이사항만)
        </label>
        <button type="button" disabled={busy || !sheet} onClick={() => void publish()} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {id ? "가이드 링크 일정 고치기" : "가이드 링크 만들기"}
        </button>
        {url && <CopyButton label="가이드 링크 복사" variant="secondary" disabled={false} getText={() => url} />}
      </div>
      {url && (
        <p className="truncate text-[11px] text-slate-500">
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            {url}
          </a>
        </p>
      )}
      {message && (
        <p role="status" className="text-emerald-700">
          {message}
        </p>
      )}
      <p className="text-[11px] text-slate-500">가이드가 휴대폰으로 일정을 보고 진행을 체크하며, 일정 변경(고객 동의 여부)·지연·사고를 시각과 함께 남깁니다. 가격 정보는 없습니다.</p>
      {id && (
        <div className="space-y-1.5 rounded-md bg-slate-50 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => void load()} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50">
              현장 기록 불러오기
            </button>
            {state && sheet && <CopyButton label="현장 보고서 복사" variant="secondary" disabled={false} getText={() => fieldReport(sheet, state)} />}
            {state && sheet && city && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const stays = fieldStays(sheet, state);
                  const notes = state.logs.map((l) => ({ at: l.at, day: l.day ?? 0, type: l.type, text: l.text }));
                  try {
                    if (stays.length) await postJson("/api/knowledge/learn", { kind: "stays", city, stays });
                    if (notes.length) await postJson("/api/knowledge/learn", { kind: "notes", city, notes });
                    setMessage(stays.length + notes.length > 0 ? `지식 창고(${city})에 현장 실측 ${stays.length}곳·기록 ${notes.length}건을 반영했습니다. 다음 코스부터 이 시간을 씁니다.` : "반영할 현장 실측·기록이 아직 없습니다.");
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : "반영하지 못했습니다.");
                  }
                }}
                className="rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-800 hover:bg-indigo-100"
              >
                지식 창고에 반영
              </button>
            )}
          </div>
          {state && (
            <>
              <p className="text-slate-600">
                진행 체크 {Object.keys(state.progress).length}건 · 기록 {state.logs.length}건
              </p>
              <ul className="space-y-0.5">
                {[...state.logs].reverse().map((l, i) => (
                  <li key={`${l.at}-${i}`}>
                    <span className="tabular-nums text-slate-400">{new Date(l.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span> {l.day ? `DAY ${l.day} ` : ""}
                    <b>[{l.type}]</b> {l.text}
                    {l.consent === "yes" && <span className="text-emerald-700"> · 고객 동의</span>}
                    {l.consent === "no" && <span className="font-semibold text-rose-700"> · 동의 못 받음</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
