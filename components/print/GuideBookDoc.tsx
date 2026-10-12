import { BASICS_GROUPS, explainMinutes, stayBreakdown, type GuideBasics, type GuideScript, type Phrase } from "@/lib/guideBook";
import type { CompanyProfile } from "@/types";
import { DocSection, DocShell } from "./DocShell";

export interface GuideDocDay {
  label: string;
  places: { name: string; script: GuideScript | null }[];
}

interface Props {
  company: CompanyProfile;
  title: string;
  subtitle: string;
  /** 상품 해설집: 날짜별 장소 (없으면 도시 교육 자료: scripts 전체) */
  days?: GuideDocDay[];
  scripts?: GuideScript[];
  basics: GuideBasics;
  phrases: Phrase[];
  emergency: { label: string; value: string }[];
  principles: string[];
  travelers: number;
}

const SITE: [keyof GuideScript["site"], string][] = [
  ["dropOff", "하차·승차"],
  ["tickets", "매표·입장"],
  ["meetPoint", "집결 장소"],
  ["restroom", "화장실"],
  ["photo", "사진 명소"],
];
const AUDIENCE: [keyof GuideScript["audience"], string][] = [
  ["family", "가족"],
  ["senior", "시니어"],
  ["student", "학생"],
  ["couple", "커플"],
];

/** 장소 원고 한 장 (인쇄용) */
function ScriptBlock({ s, travelers }: { s: GuideScript; travelers: number }) {
  const b = stayBreakdown(s, travelers);
  return (
    <div className="mb-3 border-b border-slate-200 pb-3">
      <h3 className="text-[12.5px] font-bold text-slate-900" style={{ breakAfter: "avoid" }}>
        {s.name}
        {s.area && <span className="ml-1.5 text-[10px] font-normal text-slate-500">{s.area}</span>}
        {s.status !== "reviewed" && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[9px] font-semibold text-amber-800 ring-1 ring-amber-200">초안 — 검수 전</span>}
      </h3>
      <p className="text-[9.5px] tabular-nums text-slate-500" style={{ breakAfter: "avoid" }}>
        설명 짧게 {explainMinutes(s, "short")}분 · 기본 {explainMinutes(s, "basic")}분 · 자세히 {explainMinutes(s, "long")}분 — 체류 구성: 대기 {b.wait} + 설명 {b.explain} + 관람 {b.view} + 집결 {b.gather} = {b.total}분
      </p>
      {s.intro && (
        <p className="mt-1 rounded bg-indigo-50 px-2 py-1 text-indigo-950">
          <b className="mr-1 text-[9.5px] text-indigo-700">한 줄 소개</b>
          {s.intro}
        </p>
      )}
      <ol className="mt-1 space-y-1">
        {s.points.map((p, i) => (
          <li key={`${p.title}-${i}`} className="break-inside-avoid">
            <b>
              {i + 1}. {p.title}
            </b>{" "}
            {p.text}
            {p.more && <span className="text-slate-600"> (더) {p.more}</span>}
          </li>
        ))}
      </ol>
      {SITE.some(([k]) => s.site[k]) && (
        <p className="mt-1 text-[10px] text-slate-700">
          {SITE.filter(([k]) => s.site[k])
            .map(([k, label]) => `${label}: ${s.site[k]}`)
            .join(" · ")}
        </p>
      )}
      {s.cautions.length > 0 && <p className="mt-1 text-[10px] text-amber-900">주의: {s.cautions.join(" · ")}</p>}
      {s.faq.length > 0 && (
        <div className="mt-1 text-[10px]">
          {s.faq.map((f) => (
            <p key={f.q} className="break-inside-avoid">
              <b>Q. {f.q}</b> A. {f.a}
            </p>
          ))}
        </div>
      )}
      {AUDIENCE.some(([k]) => s.audience[k]) && (
        <p className="mt-1 text-[10px] text-slate-600">
          {AUDIENCE.filter(([k]) => s.audience[k])
            .map(([k, label]) => `[${label}] ${s.audience[k]}`)
            .join("  ")}
        </p>
      )}
      {s.mustKnow.length > 0 && <p className="mt-1 text-[10px] text-emerald-900">꼭 외울 것: {s.mustKnow.map((m) => `✓ ${m}`).join("  ")}</p>}
    </div>
  );
}

/**
 * 가이드 해설집 — 상품용(날짜별 장소 원고)과 도시 교육 자료(그 도시 원고 전체) 두 가지.
 * 뒤에 상품 원칙·진행 멘트·기본기·비상 대응·비상 연락·현지 회화를 붙인다. 가격은 넣지 않는다.
 */
export function GuideBookDoc({ company, title, subtitle, days, scripts, basics, phrases, emergency, principles, travelers }: Props) {
  const missing = (days ?? []).flatMap((d) => d.places.filter((p) => !p.script).map((p) => p.name));
  return (
    <DocShell title={title} subtitle={subtitle} company={company}>
      {principles.length > 0 && (
        <DocSection title="이 상품의 원칙 (손님께 약속한 것)" keep>
          <ul className="list-disc space-y-0.5 pl-4">
            {principles.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {/* 상품 해설집은 교육 자료의 "상품 원칙" 안내 문구를 여기 함께 둔다 (끝에 따로 두지 않는다) */}
          {basics.sections
            .filter((b) => b.group === "상품 원칙")
            .map((b) => (
              <div key={b.id} className="mt-1.5">
                <p className="font-semibold text-slate-700">{b.title}</p>
                <ul className="list-disc space-y-0.5 pl-4 text-slate-700">
                  {b.lines.filter((l) => l.trim()).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
        </DocSection>
      )}

      {emergency.length > 0 && (
        <DocSection title="비상 연락" keep>
          <table className="w-full border-collapse">
            <tbody>
              {emergency.map((e) => (
                <tr key={e.label} className="border-b border-slate-200">
                  <th className="w-28 bg-slate-50 px-2 py-1 text-left font-semibold">{e.label}</th>
                  <td className="px-2 py-1">{e.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocSection>
      )}

      {days ? (
        days.map((d) => (
          <DocSection key={d.label} title={d.label}>
            {d.places.length === 0 && <p className="text-slate-500">설명할 장소가 없는 날 (이동·자유일정)</p>}
            {d.places.map((p) => (p.script ? <ScriptBlock key={p.name} s={p.script} travelers={travelers} /> : <p key={p.name} className="mb-2 text-slate-500">{p.name} — 원고 없음 (가이드 해설집에서 만드세요)</p>))}
          </DocSection>
        ))
      ) : (
        <DocSection title={`장소 설명 원고 (${scripts?.length ?? 0}곳)`}>
          {(scripts ?? []).length === 0 && <p className="text-slate-500">아직 원고가 없습니다.</p>}
          {(scripts ?? []).map((s) => (
            <ScriptBlock key={s.key} s={s} travelers={travelers} />
          ))}
        </DocSection>
      )}
      {missing.length > 0 && <p className="text-[10px] text-slate-500">원고 없는 곳 {missing.length}곳: {missing.join(", ")}</p>}

      {BASICS_GROUPS.filter((g) => !(g === "상품 원칙" && principles.length > 0)).map((g) => {
        const secs = basics.sections.filter((s) => s.group === g && s.lines.some((l) => l.trim()));
        if (secs.length === 0) return null;
        return (
          <DocSection key={g} title={g === "멘트" ? "진행 멘트" : g}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {secs.map((s) => (
                <div key={s.id} className="break-inside-avoid">
                  <h3 className="font-bold text-slate-900">{s.title}</h3>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {s.lines.filter((l) => l.trim()).map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </DocSection>
        );
      })}

      {phrases.length > 0 && (
        <DocSection title="현지 회화">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th className="px-2 py-1">한국어</th>
                <th className="px-2 py-1">현지어</th>
                <th className="px-2 py-1">발음</th>
              </tr>
            </thead>
            <tbody>
              {phrases.map((p) => (
                <tr key={`${p.ko}-${p.local}`} className="border-b border-slate-100">
                  <td className="px-2 py-0.5">{p.ko}</td>
                  <td className="px-2 py-0.5">{p.local}</td>
                  <td className="px-2 py-0.5 text-slate-600">{p.say}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocSection>
      )}
    </DocShell>
  );
}
