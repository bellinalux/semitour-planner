"use client";

import { useState } from "react";
import { SCORE_KEYS, SCORE_LABELS } from "@/lib/reviews";

function Stars({ label, value, onChange, big }: { label: string; value: number; onChange: (v: number) => void; big?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}점`}
          onClick={() => onChange(n)}
          className={`${big ? "text-3xl" : "text-xl"} leading-none ${n <= value ? "text-amber-400" : "text-slate-300"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/** 후기 보내기 — 전체 별점(필수)과 항목별 점수·한마디(선택) */
/** 장소 고르기 (3곳까지) */
function PlacePicker({ label, places, value, onChange, disabled }: { label: string; places: string[]; value: string[]; onChange: (v: string[]) => void; disabled: string[] }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs text-slate-600">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {places.map((p) => {
          const on = value.includes(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              disabled={!on && (value.length >= 3 || disabled.includes(p))}
              onClick={() => onChange(on ? value.filter((x) => x !== p) : [...value, p])}
              className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-40 ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600"}`}
            >
              {p}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ReviewForm({ id, places = [] }: { id: string; places?: string[] }) {
  const [best, setBest] = useState<string[]>([]);
  const [worst, setWorst] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [scores, setScores] = useState<Partial<Record<(typeof SCORE_KEYS)[number], number>>>({});
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; message?: string }>({ status: "idle" });

  const send = async () => {
    if (rating === 0) return setState({ status: "error", message: "전체 별점을 골라 주세요." });
    setState({ status: "sending" });
    try {
      const r = await fetch(`/api/review/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, scores, comment, name, best, worst }) });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        return setState({ status: "error", message: j?.error?.message ?? "보내지 못했습니다." });
      }
      setState({ status: "done" });
    } catch {
      setState({ status: "error", message: "연결이 끊겼습니다. 잠시 뒤 다시 보내 주세요." });
    }
  };

  if (state.status === "done") return <p className="rounded-xl bg-emerald-50 px-4 py-6 text-center font-semibold text-emerald-800">소중한 의견 감사합니다!</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="space-y-1">
        <p className="font-semibold">전체 만족도</p>
        <Stars label="전체 만족도" value={rating} onChange={setRating} big />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {SCORE_KEYS.map((k) => (
          <div key={k} className="space-y-0.5">
            <p className="text-xs text-slate-600">{SCORE_LABELS[k]}</p>
            <Stars label={SCORE_LABELS[k]} value={scores[k] ?? 0} onChange={(v) => setScores((s) => ({ ...s, [k]: v }))} />
          </div>
        ))}
      </div>
      {places.length > 0 && (
        <>
          <PlacePicker label="가장 좋았던 곳 (3곳까지, 선택)" places={places} value={best} onChange={setBest} disabled={worst} />
          <PlacePicker label="아쉬웠던 곳 (3곳까지, 선택)" places={places} value={worst} onChange={setWorst} disabled={best} />
        </>
      )}
      <label className="block space-y-1">
        <span className="text-xs text-slate-600">좋았던 점·아쉬웠던 점 (선택)</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-slate-600">이름 (선택)</span>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </label>
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      <button type="submit" disabled={state.status === "sending"} className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {state.status === "sending" ? "보내는 중…" : "후기 보내기"}
      </button>
    </form>
  );
}
