"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { TIER, type GuideScript, type GuideStop, type GuideTier } from "@/lib/guideBook";

const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none";
const lines = (v: string[]) => v.join("\n");
const toLines = (v: string) =>
  v
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

const blankStop = (): GuideStop => ({ title: "", hook: "", look: "", text: "", meaning: "", korea: "", question: "", transition: "", more: "" });

const STOP_FIELDS: { key: keyof GuideStop; label: string; rows: number; hint: string }[] = [
  { key: "hook", label: "도입 한마디", rows: 2, hint: "도착해서 첫 마디 — 주의를 끄는 질문·한 줄" },
  { key: "look", label: "👀 여기 보세요", rows: 2, hint: "손으로 가리킬 것과 무엇을 보면 되는지" },
  { key: "text", label: "📖 이야기", rows: 6, hint: "역사·전설·일화 — 사람과 사건 중심으로" },
  { key: "meaning", label: "💡 의미", rows: 3, hint: "상징·건축·종교·문화적 의미" },
  { key: "korea", label: "🇰🇷 한국과 비교", rows: 2, hint: "한국 손님이 아는 것과 비교 (영어 원고는 외국인이 아는 것과)" },
  { key: "question", label: "❓ 손님에게 질문", rows: 2, hint: "질문 1개와 (답)" },
  { key: "transition", label: "➡ 다음 지점으로", rows: 2, hint: "연결 멘트 (마지막이면 자유 관람·집결 안내)" },
  { key: "more", label: "➕ 더 깊은 이야기", rows: 3, hint: "자세히 버전에서만" },
];

/** 원고 고치기 — 저장하면 서버에 남고(고친 사람·날짜), 검수 완료는 따로 누른다. 연출 표시는 [잠시 멈춤]처럼 대괄호로 */
export function ScriptEditor({ script, onSave, onCancel, busy, english = false }: { script: GuideScript; onSave: (next: GuideScript) => void; onCancel: () => void; busy?: boolean; english?: boolean }) {
  const [s, setS] = useState<GuideScript>(script);
  const set = (patch: Partial<GuideScript>) => setS((cur) => ({ ...cur, ...patch }));
  const setStop = (i: number, patch: Partial<GuideStop>) => set({ points: s.points.map((x, k) => (k === i ? { ...x, ...patch } : x)) });

  return (
    <form
      aria-label={`${script.name} ${english ? "영어 " : ""}원고 고치기`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...s, version: Math.max(2, s.version) });
      }}
      className="space-y-3 text-xs"
    >
      {english && <p className="rounded-md bg-indigo-50 px-2 py-1 text-indigo-900">영어 원고 고치기 — 장소 이름·등급·대기·관람 시간·가이드 노트는 한국어 원고와 같이 씁니다.</p>}
      <div className={`grid gap-2 sm:grid-cols-[1fr_10rem_9rem] ${english ? "hidden" : ""}`}>
        <label className="space-y-0.5">
          <span className="font-semibold text-slate-600">장소 이름</span>
          <input value={s.name} onChange={(e) => set({ name: e.target.value })} className={input} required />
        </label>
        <label className="space-y-0.5">
          <span className="font-semibold text-slate-600">구역</span>
          <input value={s.area} onChange={(e) => set({ area: e.target.value })} className={input} />
        </label>
        <label className="space-y-0.5">
          <span className="font-semibold text-slate-600">장소 등급</span>
          <select value={s.tier} onChange={(e) => set({ tier: e.target.value as GuideTier })} className={input}>
            {(Object.keys(TIER) as GuideTier[]).map((t) => (
              <option key={t} value={t}>
                {TIER[t].label} ({TIER[t].minutes[0]}~{TIER[t].minutes[1]}분)
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-0.5">
        <span className="font-semibold text-slate-600">버스 안 소개 (도착 전 1분)</span>
        <textarea value={s.intro} onChange={(e) => set({ intro: e.target.value })} rows={3} className={input} />
      </label>

      <fieldset className="space-y-2">
        <legend className="font-semibold text-slate-600">지점별 해설 (동선 순서 · 연출 표시는 [잠시 멈춤]처럼)</legend>
        {s.points.map((p, i) => (
          <div key={i} className="space-y-1 rounded-md border border-slate-200 p-2">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 rounded bg-slate-900 px-1.5 text-[10.5px] font-bold text-white">지점 {i + 1}</span>
              <input value={p.title} aria-label={`지점 ${i + 1} 이름`} onChange={(e) => setStop(i, { title: e.target.value })} className={input} placeholder="지점 이름" />
              <button type="button" aria-label={`지점 ${i + 1} 지우기`} onClick={() => set({ points: s.points.filter((_, k) => k !== i) })} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {STOP_FIELDS.map((f) => (
                <label key={f.key} className={`space-y-0.5 ${f.key === "text" || f.key === "more" ? "sm:col-span-2" : ""}`}>
                  <span className="text-[10.5px] text-slate-500" title={f.hint}>
                    {f.label}
                  </span>
                  <textarea value={p[f.key]} aria-label={`지점 ${i + 1} ${f.label}`} onChange={(e) => setStop(i, { [f.key]: e.target.value })} rows={f.rows} className={input} placeholder={f.hint} />
                </label>
              ))}
            </div>
          </div>
        ))}
        {s.points.length < 10 && (
          <button type="button" onClick={() => set({ points: [...s.points, blankStop()] })} className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-slate-600 hover:border-indigo-400 hover:text-indigo-700">
            <Plus className="size-3.5" aria-hidden />
            지점 추가
          </button>
        )}
      </fieldset>

      {!english && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-0.5">
            <span className="font-semibold text-slate-600">📝 가이드 노트 (손님에게 읽지 않는 배경지식, 한 줄에 하나)</span>
            <textarea value={lines(s.guideNotes)} onChange={(e) => set({ guideNotes: toLines(e.target.value).slice(0, 12) })} rows={5} className={input} />
          </label>
          <label className="space-y-0.5">
            <span className="font-semibold text-slate-600">🧓 베테랑 가이드 메모 (내 멘트·현장 팁 — 다음 원고에 반영)</span>
            <textarea value={s.veteran} onChange={(e) => set({ veteran: e.target.value.slice(0, 3000) })} rows={5} className={input} />
          </label>
        </div>
      )}

      {!english && s.checks.length > 0 && (
        <fieldset className="space-y-1 rounded-md border border-rose-200 bg-rose-50 p-2">
          <legend className="px-1 font-semibold text-rose-800">⚠ 사실 확인 필요 — 확인하고 고쳤으면 지우세요</legend>
          {s.checks.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5 text-rose-900">
              <span className="min-w-0 flex-1">
                <b>[{c.where}]</b> {c.claim} — {c.reason}
              </span>
              <button type="button" onClick={() => set({ checks: s.checks.filter((_, k) => k !== i) })} className="shrink-0 rounded border border-rose-300 bg-white px-1.5 py-0.5 text-[10.5px] hover:bg-rose-100">
                확인함
              </button>
            </div>
          ))}
        </fieldset>
      )}

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
        <div className={`grid grid-cols-2 gap-2 ${english ? "hidden" : ""}`}>
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
