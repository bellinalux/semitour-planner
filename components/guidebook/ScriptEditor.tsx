"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { GuideScript } from "@/lib/guideBook";

const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none";
const lines = (v: string[]) => v.join("\n");
const toLines = (v: string) =>
  v
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/** 원고 고치기 — 저장하면 서버에 남고(고친 사람·날짜), 검수 완료는 따로 누른다 */
export function ScriptEditor({ script, onSave, onCancel, busy }: { script: GuideScript; onSave: (next: GuideScript) => void; onCancel: () => void; busy?: boolean }) {
  const [s, setS] = useState<GuideScript>(script);
  const set = (patch: Partial<GuideScript>) => setS((cur) => ({ ...cur, ...patch }));

  return (
    <form
      aria-label={`${script.name} 원고 고치기`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(s);
      }}
      className="space-y-3 text-xs"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <label className="space-y-0.5">
          <span className="font-semibold text-slate-600">장소 이름</span>
          <input value={s.name} onChange={(e) => set({ name: e.target.value })} className={input} required />
        </label>
        <label className="space-y-0.5">
          <span className="font-semibold text-slate-600">구역</span>
          <input value={s.area} onChange={(e) => set({ area: e.target.value })} className={input} />
        </label>
      </div>
      <label className="block space-y-0.5">
        <span className="font-semibold text-slate-600">한 줄 소개 (버스에서 30초)</span>
        <textarea value={s.intro} onChange={(e) => set({ intro: e.target.value })} rows={2} className={input} />
      </label>

      <fieldset className="space-y-2">
        <legend className="font-semibold text-slate-600">설명 포인트</legend>
        {s.points.map((p, i) => (
          <div key={i} className="space-y-1 rounded-md border border-slate-200 p-2">
            <div className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-center font-semibold text-slate-400">{i + 1}</span>
              <input value={p.title} aria-label={`포인트 ${i + 1} 제목`} onChange={(e) => set({ points: s.points.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} className={input} placeholder="제목" />
              <button type="button" aria-label={`포인트 ${i + 1} 지우기`} onClick={() => set({ points: s.points.filter((_, k) => k !== i) })} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
            <textarea value={p.text} aria-label={`포인트 ${i + 1} 설명`} onChange={(e) => set({ points: s.points.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} rows={3} className={input} placeholder="기본 설명" />
            <textarea value={p.more} aria-label={`포인트 ${i + 1} 덧붙일 이야기`} onChange={(e) => set({ points: s.points.map((x, k) => (k === i ? { ...x, more: e.target.value } : x)) })} rows={2} className={input} placeholder="자세히 버전에 덧붙일 이야기 (선택)" />
          </div>
        ))}
        {s.points.length < 8 && (
          <button type="button" onClick={() => set({ points: [...s.points, { title: "", text: "", more: "" }] })} className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-slate-600 hover:border-indigo-400 hover:text-indigo-700">
            <Plus className="size-3.5" aria-hidden />
            포인트 추가
          </button>
        )}
      </fieldset>

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 font-semibold text-slate-600">현장 진행</legend>
        {(
          [
            ["dropOff", "하차·승차 위치"],
            ["tickets", "매표·입장 방법"],
            ["meetPoint", "집결 장소"],
            ["restroom", "화장실"],
            ["photo", "사진 명소"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="space-y-0.5">
            <span className="text-slate-500">{label}</span>
            <input value={s.site[k]} onChange={(e) => set({ site: { ...s.site, [k]: e.target.value } })} className={input} />
          </label>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-0.5">
            <span className="text-slate-500">대기(분)</span>
            <input type="number" min={0} max={240} value={s.waitMin} onChange={(e) => set({ waitMin: Math.max(0, Math.min(240, Math.round(Number(e.target.value) || 0))) })} className={input} />
          </label>
          <label className="space-y-0.5">
            <span className="text-slate-500">자유 관람(분)</span>
            <input type="number" min={0} max={480} value={s.viewMin} onChange={(e) => set({ viewMin: Math.max(0, Math.min(480, Math.round(Number(e.target.value) || 0))) })} className={input} />
          </label>
        </div>
      </fieldset>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-0.5">
          <span className="font-semibold text-slate-600">주의 사항 (한 줄에 하나)</span>
          <textarea value={lines(s.cautions)} onChange={(e) => set({ cautions: toLines(e.target.value).slice(0, 8) })} rows={4} className={input} />
        </label>
        <label className="space-y-0.5">
          <span className="font-semibold text-slate-600">꼭 외울 것 (한 줄에 하나, 3개)</span>
          <textarea value={lines(s.mustKnow)} onChange={(e) => set({ mustKnow: toLines(e.target.value).slice(0, 5) })} rows={4} className={input} />
        </label>
      </div>

      <fieldset className="space-y-1">
        <legend className="font-semibold text-slate-600">자주 받는 질문</legend>
        {s.faq.map((f, i) => (
          <div key={i} className="grid gap-1 sm:grid-cols-[1fr_1.5fr_auto]">
            <input value={f.q} aria-label={`질문 ${i + 1}`} onChange={(e) => set({ faq: s.faq.map((x, k) => (k === i ? { ...x, q: e.target.value } : x)) })} className={input} placeholder="질문" />
            <input value={f.a} aria-label={`답 ${i + 1}`} onChange={(e) => set({ faq: s.faq.map((x, k) => (k === i ? { ...x, a: e.target.value } : x)) })} className={input} placeholder="답" />
            <button type="button" aria-label={`질문 ${i + 1} 지우기`} onClick={() => set({ faq: s.faq.filter((_, k) => k !== i) })} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
        {s.faq.length < 8 && (
          <button type="button" onClick={() => set({ faq: [...s.faq, { q: "", a: "" }] })} className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-slate-600 hover:border-indigo-400 hover:text-indigo-700">
            <Plus className="size-3.5" aria-hidden />
            질문 추가
          </button>
        )}
      </fieldset>

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 font-semibold text-slate-600">고객 유형별 강조</legend>
        {(
          [
            ["family", "가족"],
            ["senior", "시니어"],
            ["student", "학생"],
            ["couple", "커플"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="space-y-0.5">
            <span className="text-slate-500">{label}</span>
            <input value={s.audience[k]} onChange={(e) => set({ audience: { ...s.audience, [k]: e.target.value } })} className={input} />
          </label>
        ))}
      </fieldset>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100">
          취소
        </button>
        <button type="submit" disabled={busy || !s.name.trim()} className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          저장
        </button>
      </div>
    </form>
  );
}
