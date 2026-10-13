"use client";

import { Loader2, Sparkles } from "lucide-react";
import { Fragment, useState } from "react";
import { CUE, explainMinutes, LANG_LABEL, LENGTH_LABEL, scriptIn, scriptQuality, stayBreakdown, stopMinutes, TIER, type GuideLang, type GuideScript, type GuideStop, type ScriptLength } from "@/lib/guideBook";

const SITE: { key: keyof GuideScript["site"]; label: string }[] = [
  { key: "dropOff", label: "하차·승차" },
  { key: "tickets", label: "매표·입장" },
  { key: "meetPoint", label: "집결 장소" },
  { key: "restroom", label: "화장실" },
  { key: "photo", label: "사진 명소" },
];
const AUDIENCE: { key: keyof GuideScript["audience"]; label: string }[] = [
  { key: "family", label: "가족" },
  { key: "senior", label: "시니어" },
  { key: "student", label: "학생" },
  { key: "couple", label: "커플" },
];

/** 연출 표시 [잠시 멈춤]를 회색 작은 글씨로 */
export function Cued({ text }: { text: string }) {
  const parts = text.split(new RegExp(`(${CUE.source})`, "g"));
  return (
    <>
      {parts.map((p, i) =>
        /^\[[^\]\n]{1,40}\]$/.test(p) ? (
          <span key={i} className="mx-0.5 rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-500">
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** 지점 한 곳 — 길이에 따라 (짧게: 도입·관찰 / 기본: + 이야기·의미·한국 비교·질문·연결 / 자세히: + 더 깊은 이야기) */
function StopCard({ p, i, length, onDeepen, deepening }: { p: GuideStop; i: number; length: ScriptLength; onDeepen?: (i: number) => void; deepening?: boolean }) {
  const legacy = !p.hook && !p.look;
  const row = (icon: string, label: string, v: string, tone = "") =>
    v.trim() ? (
      <p className={`text-pretty ${tone}`}>
        <span className="mr-1 text-[10.5px] font-semibold text-slate-400" title={label}>
          {icon}
        </span>
        <Cued text={v} />
      </p>
    ) : null;
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded bg-slate-900 px-1.5 text-[10.5px] font-bold text-white">지점 {i + 1}</span>
        <b className="text-slate-900">{p.title}</b>
        <span className="text-[10.5px] tabular-nums text-slate-400">약 {stopMinutes(p)}분</span>
        {onDeepen && !legacy && (
          <button type="button" disabled={deepening} onClick={() => onDeepen(i)} className="ml-auto inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[10.5px] text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="이 지점만 다시 조사해 이야기·관찰 포인트·의미를 더 풍부하게">
            {deepening ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}이 지점 더 깊게
          </button>
        )}
      </div>
      {legacy ? (
        <div className="space-y-1">
          <p className="text-pretty">{p.text}</p>
          {length === "long" && p.more && <p className="text-pretty text-slate-600">{p.more}</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {p.hook && (
            <p className="text-pretty font-semibold text-slate-900">
              <Cued text={p.hook} />
            </p>
          )}
          {row("👀 여기 보세요", "관찰 포인트", p.look, "text-sky-950")}
          {length !== "short" && (
            <>
              {row("📖", "이야기", p.text)}
              {row("💡", "의미", p.meaning, "text-slate-700")}
              {row("🇰🇷", "한국과 비교", p.korea, "text-indigo-900")}
              {row("❓", "손님에게 질문", p.question, "text-violet-900")}
              {row("➡", "다음 지점으로", p.transition, "text-slate-500")}
            </>
          )}
          {length === "long" && row("➕", "더 깊은 이야기", p.more, "text-slate-600")}
        </div>
      )}
    </li>
  );
}

/** 원고 읽기 — 언어(영어 원고가 있으면)·길이(짧게·기본·자세히), 품질, 지점별 해설, 가이드 노트, 사실 확인, 현장 진행 */
export function ScriptView({
  script: base,
  travelers = 10,
  compact = false,
  defaultLang = "ko",
  onDeepen,
  deepening = -1,
}: {
  script: GuideScript;
  travelers?: number;
  compact?: boolean;
  defaultLang?: GuideLang;
  /** 지점 한 곳 더 깊게 (한국어 원고만) */
  onDeepen?: (index: number) => void;
  deepening?: number;
}) {
  const [length, setLength] = useState<ScriptLength>("basic");
  const [lang, setLang] = useState<GuideLang>(defaultLang);
  const script = scriptIn(base, base.en ? lang : "ko") ?? base;
  const b = stayBreakdown(script, travelers);
  const q = scriptQuality(script);
  const site = SITE.filter((x) => script.site[x.key]);
  const audience = AUDIENCE.filter((x) => script.audience[x.key]);
  const showLang = base.en ? lang : "ko";

  return (
    <div className="space-y-3 text-xs leading-5 text-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        {base.en && (
          <div role="radiogroup" aria-label="원고 언어" className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
            {(["ko", "en"] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)} className={`rounded px-2 py-0.5 font-medium ${lang === l ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                {LANG_LABEL[l]}
                {l === "en" && base.en?.status !== "reviewed" ? " (초안)" : ""}
              </button>
            ))}
          </div>
        )}
        <div role="radiogroup" aria-label="원고 길이" className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {(Object.keys(LENGTH_LABEL) as ScriptLength[]).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={length === l}
              onClick={() => setLength(l)}
              className={`rounded px-2 py-0.5 font-medium tabular-nums ${length === l ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {LENGTH_LABEL[l]} {explainMinutes(script, l)}분
            </button>
          ))}
        </div>
        <span className="text-[11px] tabular-nums text-slate-500" title="대기 + 해설(기본 원고, 걸으며 지점마다) + 자유 관람 + 하차·집결 (인원에 따라)">
          체류 구성: 대기 {b.wait} · 설명 {b.explain} · 관람 {b.view} · 집결 {b.gather} = <b className="text-slate-800">{b.total}분</b>
        </span>
      </div>

      <p className={`rounded-md px-2.5 py-1 text-[11px] ${q.shallow ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`} aria-label="원고 품질">
        {q.legacy ? (
          <>예전 방식 원고 (포인트 목록) — 새 방식(지점별 전문 해설)으로 다시 만들면 이야기·관찰 포인트·한국 비교·질문·연출 표시가 들어갑니다.</>
        ) : (
          <>
            <b>{TIER[script.tier].label}</b> · 지점 {q.stops}곳 · 이야기 {q.stories} · 한국 비교 {q.korea} · 질문 {q.questions} · 연출 표시 {q.cues} · 기본 {q.minutes}분
            {q.checks > 0 && showLang === "ko" && <span className="ml-1 font-semibold text-rose-700">· 확인 필요 {q.checks}곳</span>}
            {q.shallow && <span className="ml-1 font-semibold">— 보강 필요: {q.hint}</span>}
          </>
        )}
      </p>

      {script.intro && (
        <p className="rounded-md bg-indigo-50 px-3 py-2 text-indigo-950">
          <b className="mr-1 text-[11px] text-indigo-700">버스 안 소개</b>
          <Cued text={script.intro} />
        </p>
      )}

      {script.points.length > 0 && (
        <ol className="space-y-2">
          {script.points.map((p, i) => (
            <StopCard key={`${p.title}-${i}`} p={p} i={i} length={length} onDeepen={showLang === "ko" ? onDeepen : undefined} deepening={deepening === i} />
          ))}
        </ol>
      )}

      {base.guideNotes.length > 0 && (
        <details className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2" open={!compact}>
          <summary className="cursor-pointer text-[11px] font-semibold text-amber-900">📝 가이드 노트 — 손님에게 읽지 않는 배경지식 ({base.guideNotes.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-800">
            {base.guideNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}

      {!compact && base.checks.length > 0 && showLang === "ko" && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
          <b className="text-[11px]">⚠ 사실 확인 필요 {base.checks.length}곳 — 조사 근거와 다르거나 근거가 없거나 원고 안에서 서로 다른 곳 (확인하고 고치기에서 지우세요)</b>
          <ul className="mt-1 space-y-0.5">
            {base.checks.map((c, i) => (
              <li key={i}>
                <span className="font-semibold">[{c.where}]</span> {c.claim} — <span className="text-rose-700">{c.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {base.veteran.trim() && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <b className="text-[11px] text-emerald-800">🧓 베테랑 가이드 메모</b>
          <p className="mt-0.5 whitespace-pre-line text-slate-800">{base.veteran}</p>
        </div>
      )}

      {!compact && site.length > 0 && (
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5 rounded-md bg-slate-50 px-3 py-2">
          {site.map((x) => (
            <div key={x.key} className="contents">
              <dt className="font-semibold text-slate-500">{x.label}</dt>
              <dd>{script.site[x.key]}</dd>
            </div>
          ))}
        </dl>
      )}

      {script.cautions.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
          <b className="text-[11px]">주의</b>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            {script.cautions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {!compact && script.faq.length > 0 && (
        <div>
          <b className="text-[11px] text-slate-500">자주 받는 질문</b>
          <dl className="mt-0.5 space-y-1">
            {script.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-slate-900">Q. {f.q}</dt>
                <dd>A. {f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {!compact && audience.length > 0 && (
        <div>
          <b className="text-[11px] text-slate-500">고객 유형별 강조</b>
          <ul className="mt-0.5 space-y-0.5">
            {audience.map((x) => (
              <li key={x.key}>
                <span className="mr-1 rounded bg-slate-100 px-1 text-[10.5px] font-semibold text-slate-600">{x.label}</span>
                {script.audience[x.key]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {script.mustKnow.length > 0 && (
        <div className="rounded-md border border-emerald-200 px-3 py-2">
          <b className="text-[11px] text-emerald-800">꼭 외울 것 (익힘 확인)</b>
          <ul className="mt-0.5 space-y-0.5">
            {script.mustKnow.map((m) => (
              <li key={m}>✓ {m}</li>
            ))}
          </ul>
        </div>
      )}

      {!compact && script.sources.length > 0 && (
        <p className="text-[10.5px] text-slate-400">
          출처:{" "}
          {script.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && " · "}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                {s.title || s.url}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
