"use client";

/**
 * 회사 코스 템플릿 — 팀 보관함에서 승인된 상품을 골라 일정·견적 입력칸을 채운다(붙여넣기 모드 코스 원문 + 목적지·일수·인원).
 */
import { ClipboardList, Loader2 } from "lucide-react";
import { useState } from "react";
import { parseStudioProduct, productToInputPatch } from "@/lib/studioProduct";
import type { TripInput } from "@/types";

interface Template { id: string; title: string; region: string; summary: string; savedBy: string; savedAt: string; usable: boolean }

export function CompanyTemplates({ input, onChange }: { input: TripInput; onChange: (patch: Partial<TripInput>) => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; list?: Template[]; message?: string }>({ status: "idle" });
  const [applied, setApplied] = useState("");

  const load = async () => {
    setOpen(v => !v);
    if (state.status === "done" || state.status === "loading") return;
    setState({ status: "loading" });
    try {
      const r = await fetch("/api/templates");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? "불러오지 못했습니다.");
      setState({ status: "done", list: j.templates as Template[], message: j.note });
    } catch (e) { setState({ status: "error", message: e instanceof Error ? e.message : "불러오지 못했습니다." }); }
  };

  const use = async (t: Template) => {
    try {
      const r = await fetch(`/api/templates?id=${encodeURIComponent(t.id)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? "불러오지 못했습니다.");
      const product = parseStudioProduct(j.product);
      if (!product) throw new Error("템플릿 형식이 올바르지 않습니다.");
      onChange(productToInputPatch(product, input));
      setApplied(t.title); setOpen(false);
    } catch (e) { setState(s => ({ ...s, message: e instanceof Error ? e.message : "적용하지 못했습니다." })); }
  };

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={load} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50">
        {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ClipboardList className="h-3.5 w-3.5" aria-hidden />}
        회사 코스 템플릿에서 시작
      </button>
      {applied && <p className="text-[11px] text-emerald-700">‘{applied}’ 템플릿으로 입력칸을 채웠습니다 (붙여넣기 모드). 확인한 뒤 [생성]을 누르세요.</p>}
      {open && (
        <div className="rounded-md border border-slate-200 bg-white p-2 text-xs">
          {state.status === "error" && <p className="text-rose-600">{state.message}</p>}
          {state.status === "done" && (
            <>
              {state.message && <p className="mb-1 text-slate-500">{state.message}</p>}
              {state.list && state.list.length ? (
                <ul className="max-h-60 space-y-1 overflow-y-auto">
                  {state.list.map(t => (
                    <li key={t.id} className="flex items-start justify-between gap-2 rounded border border-slate-100 p-2">
                      <span className="min-w-0">
                        <b className="block truncate text-slate-800">{t.title}</b>
                        <span className="block text-[11px] text-slate-500">{t.summary || t.region} · {t.savedBy || "이름 없음"} 승인</span>
                      </span>
                      <button type="button" disabled={!t.usable} onClick={() => use(t)} title={t.usable ? "" : "상세페이지 스튜디오에서 한 번 다시 저장하면 쓸 수 있습니다"}
                        className="shrink-0 rounded bg-indigo-600 px-2 py-1 font-semibold text-white disabled:bg-slate-300">쓰기</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">아직 승인된 템플릿이 없습니다. 상세페이지 스튜디오의 [👥 팀 보관함]에서 상품을 ‘승인’으로 저장하면 여기에 나옵니다.</p>
              )}
              {state.message && state.list?.length ? <p className="mt-1 text-rose-600">{state.message}</p> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
