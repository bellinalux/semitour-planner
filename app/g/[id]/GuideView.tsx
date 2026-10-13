"use client";

import { useState } from "react";
import { LOG_TYPES, type GuideLogInput, type GuideSheet, type GuideState } from "@/lib/guideSheet";

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 가이드 화면 — 날짜 탭, 일정 진행 체크, 현장 기록 (변경·지연·사고, 고객 동의) */
type SheetScript = GuideSheet["scripts"][number];
const nameKey = (s: string) => s.replace(/\(.*?\)|\[.*?\]/g, "").toLowerCase().replace(/[\s·,.'"\-–_/!?~]/g, "");

/** 일정 줄의 해설 원고 — 눌러서 펼친다 (한 줄 소개·설명 포인트·주의·집결·꼭 외울 것) */
function RowScript({ s: base }: { s: SheetScript }) {
  const [en, setEn] = useState(false);
  const s = en && base.en ? { ...base, ...base.en } : base;
  return (
    <details className="mt-1 rounded-md bg-violet-50 px-2 py-1 text-xs text-violet-950">
      <summary className="cursor-pointer font-semibold text-violet-800">
        🎙 해설 원고 {s.minutes}분{s.status === "reviewed" ? "" : " (초안)"}
        {base.en && " · EN"}
      </summary>
      <div className="mt-1 space-y-1.5 text-slate-800">
        {base.en && (
          <div role="radiogroup" aria-label="원고 언어" className="inline-flex rounded border border-violet-200 bg-white p-0.5 text-[11px]">
            {[false, true].map((v) => (
              <button key={String(v)} type="button" role="radio" aria-checked={en === v} onClick={() => setEn(v)} className={`rounded px-2 py-0.5 ${en === v ? "bg-violet-600 text-white" : "text-violet-800"}`}>
                {v ? "English" : "한국어"}
              </button>
            ))}
          </div>
        )}
        {s.intro && <p className="font-medium">{s.intro}</p>}
        <ol className="space-y-1.5">
          {s.points.map((p, i) => (
            <li key={i}>
              <b>
                {i + 1}. {p.title}
              </b>
              <span className="block whitespace-pre-line">{p.text}</span>
            </li>
          ))}
        </ol>
        {base.notes.length > 0 && (
          <details className="rounded bg-amber-50 px-2 py-1 text-amber-950">
            <summary className="cursor-pointer font-semibold">📝 가이드 노트 (읽지 않음)</summary>
            <ul className="list-disc pl-4">
              {base.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        )}
        {s.meetPoint && <p className="text-slate-600">집결: {s.meetPoint}</p>}
        {s.cautions.length > 0 && <p className="text-amber-800">주의: {s.cautions.join(" · ")}</p>}
        {s.mustKnow.length > 0 && <p className="text-emerald-800">꼭 외울 것: {s.mustKnow.join(" · ")}</p>}
      </div>
    </details>
  );
}

export function GuideView({ id, sheet, initial }: { id: string; sheet: GuideSheet; initial: GuideState }) {
  // 일정 줄 이름에 맞는 원고 (같은 이름 먼저, 없으면 한쪽 이름이 다른 쪽에 들어 있는 것)
  const scriptOf = (title: string): SheetScript | undefined => {
    const k = nameKey(title);
    return sheet.scripts.find((s) => nameKey(s.name) === k) ?? sheet.scripts.filter((s) => nameKey(s.name).length >= 2 && k.includes(nameKey(s.name))).sort((a, b) => b.name.length - a.name.length)[0];
  };
  const [state, setState] = useState(initial);
  const [dayNo, setDayNo] = useState(sheet.days[0]?.day ?? 1);
  const [draft, setDraft] = useState<GuideLogInput>({ type: "일정 변경", day: sheet.days[0]?.day ?? 1, text: "", consent: "na", by: "" });
  const [error, setError] = useState("");
  const day = sheet.days.find((d) => d.day === dayNo) ?? sheet.days[0];

  /** 체크 응답은 진행만, 기록 응답은 기록만 반영한다 (동시에 보낸 다른 쪽 화면 값을 덮지 않게) */
  const send = async (body: { action: "check" | "log" } & Record<string, unknown>) => {
    setError("");
    try {
      const r = await fetch(`/api/guide/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(j?.error?.message ?? "저장하지 못했습니다.");
        return false;
      }
      const next = (await r.json()) as GuideState;
      setState((s) => (body.action === "check" ? { ...s, progress: next.progress } : { ...s, logs: next.logs }));
      return true;
    } catch {
      setError("연결이 끊겼습니다. 잠시 뒤 다시 눌러 주세요.");
      return false;
    }
  };

  /** 누르는 즉시 체크하고, 저장에 실패하면 되돌린다 (현장 통신이 느려도 바로 보이게) */
  const check = async (key: string, done: boolean) => {
    const was = state.progress[key];
    const apply = (v: string | undefined) =>
      setState((s) => {
        const progress = { ...s.progress };
        if (v) progress[key] = v;
        else delete progress[key];
        return { ...s, progress };
      });
    apply(done ? new Date().toISOString() : undefined);
    if (!(await send({ action: "check", key, done }))) apply(was);
  };

  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-4 bg-white px-4 pb-24 pt-5 text-sm text-slate-800">
      <header className="space-y-0.5">
        <p className="text-xs font-semibold text-indigo-700">운영 지시서 · 가이드용 (가격 정보 없음)</p>
        <h1 className="text-lg font-bold text-slate-900">{sheet.title}</h1>
        <p className="text-slate-600">
          {sheet.period} · {sheet.travelers}명
        </p>
      </header>

      <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-0.5 rounded-xl bg-slate-50 p-3 text-xs">
        {sheet.notes.map((n) => (
          <div key={n.label} className="contents">
            <dt className="text-slate-500">{n.label}</dt>
            <dd>{n.value}</dd>
          </div>
        ))}
        {sheet.company.emergency && (
          <div className="contents">
            <dt className="text-slate-500">비상연락</dt>
            <dd className="font-semibold">{sheet.company.emergency}</dd>
          </div>
        )}
      </dl>

      <nav aria-label="날짜" className="flex gap-1 overflow-x-auto">
        {sheet.days.map((d) => (
          <button key={d.day} type="button" aria-pressed={d.day === dayNo} onClick={() => setDayNo(d.day)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${d.day === dayNo ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
            DAY {d.day}
          </button>
        ))}
      </nav>

      {day && (
        <section aria-label={`DAY ${day.day} 일정`} className="space-y-2">
          <p className="text-xs text-slate-600">
            {day.date} · {day.region} · 미팅 {day.meeting}
            <span className="block">🍴 {day.meals}</span>
          </p>
          <ol className="space-y-1">
            {day.rows.map((r) => {
              const key = `${day.day}:${r.key}`;
              const done = state.progress[key];
              if (r.move)
                return (
                  <li key={r.key} className="pl-9 text-xs text-slate-400">
                    {r.title}
                  </li>
                );
              return (
                <li key={r.key} className={`flex items-start gap-2 rounded-lg border p-2 ${done ? "border-emerald-200 bg-emerald-50" : "border-slate-200"}`}>
                  <input type="checkbox" aria-label={`${r.title} 진행`} checked={Boolean(done)} onChange={(e) => void check(key, e.target.checked)} className="mt-1 size-5" />
                  <span className="min-w-0 flex-1">
                    {r.time && <span className="mr-1 text-xs font-semibold tabular-nums text-indigo-700">{r.time}</span>}
                    <span className="font-medium">{r.title}</span>
                    {r.notes.map((n) => (
                      <span key={n} className="block text-xs text-slate-500">
                        {n}
                      </span>
                    ))}
                    {done && <span className="block text-[11px] text-emerald-700">✓ {when(done)} 진행</span>}
                    {scriptOf(r.title) && <RowScript s={scriptOf(r.title)!} />}
                  </span>
                </li>
              );
            })}
          </ol>
          {day.hotel && <p className="text-xs text-slate-600">🏨 {day.hotel}</p>}
          {[...day.options, ...day.warnings].map((w) => (
            <p key={w} className="text-xs text-amber-800">
              • {w}
            </p>
          ))}
        </section>
      )}

      {sheet.tips.length > 0 && (
        <details className="rounded-xl border border-slate-200 p-3 text-xs">
          <summary className="cursor-pointer font-semibold">진행 멘트·기본기·비상 대응</summary>
          <div className="mt-2 space-y-2">
            {sheet.tips.map((t) => (
              <div key={t.title}>
                <p className="font-semibold">{t.title}</p>
                <ul className="list-disc space-y-0.5 pl-4 text-slate-700">
                  {t.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      {sheet.names.length > 0 && (
        <details className="rounded-xl border border-slate-200 p-3 text-xs">
          <summary className="cursor-pointer font-semibold">명단·객실 ({sheet.names.length}명)</summary>
          <ul className="mt-1 space-y-0.5">
            {sheet.names.map((p, i) => (
              <li key={`${p.name}-${i}`}>
                {p.room > 0 && <span className="mr-1 tabular-nums text-slate-500">{p.room}호</span>}
                {p.name}
                {p.note && <span className="text-amber-700"> · {p.note}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section aria-label="현장 기록" className="space-y-2 rounded-xl border border-slate-200 p-3">
        <h2 className="font-semibold">현장 기록 (변경·지연·사고)</h2>
        <div className="flex flex-wrap gap-1">
          {LOG_TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={draft.type === t} onClick={() => setDraft({ ...draft, type: t })} className={`rounded-full px-2.5 py-1 text-xs ${draft.type === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
              {t}
            </button>
          ))}
        </div>
        <textarea aria-label="기록 내용" rows={3} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value.slice(0, 300) })} placeholder="예) 우천으로 콜로안 빌리지 → 실내 박물관으로 변경" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        {draft.type === "일정 변경" && (
          <div role="radiogroup" aria-label="고객 동의" className="flex gap-2 text-xs">
            {(
              [
                ["yes", "고객 동의 받음"],
                ["no", "동의 못 받음"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="inline-flex items-center gap-1">
                <input type="radio" name="consent" checked={draft.consent === v} onChange={() => setDraft({ ...draft, consent: v })} />
                {label}
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input aria-label="기록한 사람" value={draft.by} onChange={(e) => setDraft({ ...draft, by: e.target.value.slice(0, 30) })} placeholder="이름 (선택)" className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          <button
            type="button"
            disabled={!draft.text.trim()}
            onClick={async () => {
              if (await send({ action: "log", entry: { ...draft, day: dayNo, consent: draft.type === "일정 변경" ? draft.consent : "na" } })) setDraft({ ...draft, text: "" });
            }}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            기록 남기기
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {state.logs.length > 0 && (
          <ul className="space-y-1 border-t border-slate-100 pt-2 text-xs">
            {[...state.logs].reverse().map((l, i) => (
              <li key={`${l.at}-${i}`}>
                <span className="tabular-nums text-slate-400">{when(l.at)}</span> {l.day ? `DAY ${l.day} ` : ""}
                <b>[{l.type}]</b> {l.text}
                {l.consent === "yes" && <span className="text-emerald-700"> · 동의</span>}
                {l.consent === "no" && <span className="text-rose-700"> · 동의 못 받음</span>}
                {l.by && <span className="text-slate-400"> — {l.by}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheet.company.emergency && (
        <a href={`tel:${sheet.company.emergency.replace(/[^\d+]/g, "").slice(0, 15)}`} className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] rounded-lg bg-rose-600 py-3 text-center text-sm font-semibold text-white">
          여행사 비상연락
        </a>
      )}
    </main>
  );
}
