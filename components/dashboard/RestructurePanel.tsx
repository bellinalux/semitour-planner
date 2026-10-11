"use client";

import { AlertTriangle, CalendarRange, Check, Loader2 } from "lucide-react";
import { useContext, useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { CourseEngineContext } from "@/hooks/useCourseEngine";
import { addPlace, samePlace } from "@/lib/differentiate";
import type { PmChoice } from "@/lib/itinerary";
import { dayItems } from "@/lib/itinerary";
import { citiesOf, type CityKnowledge } from "@/lib/knowledge";
import type { PackageRules } from "@/lib/packageRules";
import { diagnoseTrip, restructurePlans, STATUS_LABEL, type DayStatus } from "@/lib/restructure";
import type { DayPlan, ItineraryItem, TripInput } from "@/types";

const TONE: Record<DayStatus, string> = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  impossible: "bg-rose-50 text-rose-800 ring-rose-200",
  over: "bg-amber-50 text-amber-900 ring-amber-300",
  empty: "bg-sky-50 text-sky-800 ring-sky-200",
  order: "bg-slate-50 text-slate-700 ring-slate-200",
};

/** 항목 유형 → 지식 창고 장소 종류 (대안 장소를 같은 종류에서 찾는다) */
const KIND: Record<string, string> = { sightseeing: "sight", experience: "activity", shopping: "shopping", massage: "activity", meal: "meal" };

/**
 * 전체 일정 재구성 — 날마다 진단(불가능·넘침·비어 있음·순서)과, 여행 전체로 계산한 변경안(균형·여유·알찬)을
 * 전·후 비교로 보여 주고 고른 안을 적용한다. 뺀 곳·못 푼 곳은 지식 창고에서 대안 장소를 추천한다.
 */
export function RestructurePanel({ input, rules, days, pmChoice, onApplyDays }: { input: TripInput; rules: PackageRules; days: DayPlan[]; pmChoice: PmChoice; onApplyDays?: (days: DayPlan[]) => void }) {
  const diagnosis = useMemo(() => diagnoseTrip(days, pmChoice, rules), [days, pmChoice, rules]);
  const plans = useMemo(() => restructurePlans(days, pmChoice, rules), [days, pmChoice, rules]);
  const [pick, setPick] = useState<string>("");
  const [message, setMessage] = useState("");
  const engine = useContext(CourseEngineContext);
  const plan = plans.find((p) => p.key === pick) ?? plans[0] ?? null;
  const bad = diagnosis.filter((d) => d.status !== "ok");
  const city = citiesOf(input.destination)[0] ?? "";
  const [kb, setKb] = useState<CityKnowledge | null>(null);
  useEffect(() => {
    if (!city) return;
    let alive = true;
    fetch(`/api/knowledge?city=${encodeURIComponent(city)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ doc: CityKnowledge }>) : null))
      .then((j) => alive && setKb(j?.doc ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [city]);

  // 대안 장소 — 뺀 곳과 같은 종류, 일정에 없는 곳, 인기순 3곳
  const names = days.flatMap((d) => dayItems(d, pmChoice).map((i) => i.name));
  const alternatives = (it: ItineraryItem) =>
    (kb?.places ?? [])
      .filter((p) => (KIND[it.type ?? "sightseeing"] ?? "sight") === p.kind && !names.some((n) => samePlace(n, p.name)))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 3);

  return (
    <SectionCard
      title="전체 일정 재구성"
      description="날마다 할 수 없는 시간·넘침·빈 시간·순서를 보고, 여행 전체로 계산한 변경안을 전·후 비교로 제안합니다"
      icon={CalendarRange}
      collapsible
      defaultOpen={bad.length > 0}
      summary={bad.length === 0 ? "모든 날 문제 없음" : `재구성이 필요합니다 (${bad.length}일)`}
      anchorId="restructure"
    >
      <div className="space-y-3 text-xs">
        {/* 날마다 진단 */}
        <ul aria-label="날마다 진단" className="space-y-1">
          {diagnosis.map((d) => {
            const lines = [...d.impossible, ...d.over, ...d.empty, ...d.order];
            return (
              <li key={d.day} className="flex flex-wrap items-start gap-1.5">
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ring-1 ${TONE[d.status]}`}>
                  DAY {d.day} · {STATUS_LABEL[d.status]}
                </span>
                <span className="min-w-0 flex-1 text-pretty text-slate-600">{lines.slice(0, 3).join(" · ") || "문제 없음"}{lines.length > 3 ? ` 외 ${lines.length - 3}건` : ""}</span>
              </li>
            );
          })}
        </ul>

        {engine && (
          <button
            type="button"
            onClick={() => void engine.run()}
            disabled={engine.running}
            title="장소마다 운영 시간·휴무일·좌표를 웹에서 찾아 저장합니다 (한 번 찾은 곳은 다른 상품에도 씁니다)"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {engine.running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
            {engine.running ? "운영 시간 확인 중…" : "운영 시간·휴무일 웹 확인"}
          </button>
        )}

        {plans.length === 0 ? (
          bad.length > 0 && <p className="text-pretty text-slate-500">자동으로 나눌 수 있는 변경안이 없습니다 — 아래 일정 카드의 점검과 [규칙대로 정리]를 확인하세요.</p>
        ) : (
          <>
            <div role="radiogroup" aria-label="변경안" className="flex flex-wrap gap-1.5">
              {plans.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={plan?.key === p.key}
                  onClick={() => setPick(p.key)}
                  className={`rounded-md border px-2.5 py-1 text-left ${plan?.key === p.key ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-indigo-300"}`}
                >
                  <span className="block font-semibold text-slate-800">{p.label}</span>
                </button>
              ))}
            </div>
            {plan && (
              <div className="space-y-2">
                <p className="text-pretty text-slate-600">{plan.description}</p>
                <table aria-label="변경 전후" className="w-full text-left tabular-nums">
                  <thead className="text-[11px] text-slate-500">
                    <tr>
                      <th className="py-1 pr-2 font-medium">날</th>
                      <th className="py-1 pr-2 font-medium">미팅</th>
                      <th className="py-1 pr-2 font-medium">끝</th>
                      <th className="py-1 pr-2 font-medium">장소</th>
                      <th className="py-1 pr-2 font-medium">강도</th>
                      <th className="py-1 font-medium">점검</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.before.map((b, k) => {
                      const a = plan.after[k];
                      const cell = (x: string | number, y: string | number) => (x === y ? <span>{y}</span> : <span><span className="text-slate-400 line-through">{x}</span> → <b className="text-indigo-700">{y}</b></span>);
                      return (
                        <tr key={b.day} className="border-t border-slate-100">
                          <td className="py-1 pr-2 font-semibold">DAY {b.day}</td>
                          <td className="py-1 pr-2">{cell(b.meeting, a.meeting)}</td>
                          <td className="py-1 pr-2">{cell(b.end, a.end)}</td>
                          <td className="py-1 pr-2">{cell(b.places, a.places)}</td>
                          <td className="py-1 pr-2">{cell(b.intensity, a.intensity)}</td>
                          <td className="py-1">{cell(b.issues, a.issues)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <ul aria-label="바뀌는 것" className="list-disc space-y-0.5 pl-4 text-pretty text-slate-700">
                  {plan.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                {onApplyDays && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyDays(plan.days);
                      setMessage(`${plan.label}으로 바꿨습니다. 되돌리기는 화면 오른쪽 아래 [되돌리기].`);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
                  >
                    이 안으로 바꾸기
                  </button>
                )}
                {plan.dropped.length > 0 && (
                  <div>
                    <p className="font-semibold text-slate-800">빼는 곳과 대안 장소</p>
                    <ul aria-label="대안 장소" className="mt-1 space-y-1">
                      {plan.dropped.map(({ day, item }) => {
                        const alts = alternatives(item);
                        return (
                          <li key={item.id} className="text-pretty">
                            <b>{item.name}</b> <span className="text-slate-500">(DAY {day})</span>
                            {alts.length > 0 ? (
                              <span className="ml-1 inline-flex flex-wrap gap-1">
                                대안:
                                {alts.map((p) => (
                                  <button
                                    key={p.name}
                                    type="button"
                                    disabled={!onApplyDays}
                                    onClick={() => {
                                      const r = addPlace(days, pmChoice, { name: p.name, agencies: p.agencies, score: p.popularity }, kb);
                                      if (r && onApplyDays) {
                                        onApplyDays(r.days);
                                        setMessage(`${p.name}을(를) DAY ${r.day}에 넣었습니다.`);
                                      } else setMessage(`${p.name}을(를) 넣을 여유 있는 날이 없습니다.`);
                                    }}
                                    className="rounded border border-slate-300 bg-white px-1.5 font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    + {p.name}
                                  </button>
                                ))}
                              </span>
                            ) : (
                              <span className="ml-1 text-slate-400">대안은 지식 창고에 장소가 쌓이면 추천합니다</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {plan.left.length > 0 && (
                  <div className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-900">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                    <div>
                      <p className="font-semibold">직원 판단 필요 ({plan.left.length})</p>
                      <ul aria-label="직원 판단 필요" className="mt-0.5 space-y-0.5 text-pretty">
                        {plan.left.slice(0, 6).map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {message && (
          <p role="status" className="text-emerald-700">
            {message}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
