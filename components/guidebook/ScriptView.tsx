"use client";

import { useState } from "react";
import { explainMinutes, LENGTH_LABEL, stayBreakdown, type GuideScript, type ScriptLength } from "@/lib/guideBook";

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

/** 원고 읽기 — 길이(짧게·기본·자세히)를 고르면 그 길이의 원고와 말하는 시간, 체류 시간 구성 */
export function ScriptView({ script, travelers = 10, compact = false }: { script: GuideScript; travelers?: number; compact?: boolean }) {
  const [length, setLength] = useState<ScriptLength>("basic");
  const pts = length === "short" ? script.points.slice(0, 2) : script.points;
  const b = stayBreakdown(script, travelers);
  const site = SITE.filter((x) => script.site[x.key]);
  const audience = AUDIENCE.filter((x) => script.audience[x.key]);

  return (
    <div className="space-y-3 text-xs leading-5 text-slate-700">
      <div className="flex flex-wrap items-center gap-2">
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
        <span className="text-[11px] tabular-nums text-slate-500" title="대기 + 설명(기본 원고) + 자유 관람 + 하차·집결 (인원에 따라)">
          체류 구성: 대기 {b.wait} · 설명 {b.explain} · 관람 {b.view} · 집결 {b.gather} = <b className="text-slate-800">{b.total}분</b>
        </span>
      </div>

      {script.intro && (
        <p className="rounded-md bg-indigo-50 px-3 py-2 text-indigo-950">
          <b className="mr-1 text-[11px] text-indigo-700">한 줄 소개</b>
          {script.intro}
        </p>
      )}

      {pts.length > 0 && (
        <ol className="space-y-2">
          {pts.map((p, i) => (
            <li key={`${p.title}-${i}`}>
              <p className="font-semibold text-slate-900">
                {i + 1}. {p.title}
              </p>
              <p className="text-pretty">{p.text}</p>
              {length === "long" && p.more && <p className="mt-0.5 text-pretty text-slate-600">{p.more}</p>}
            </li>
          ))}
        </ol>
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
