"use client";

import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { createContext, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import type { PmChoice } from "@/lib/itinerary";
import { applyPackageRules, applyRuleMeeting, REGION_LABEL, toOptionalTours, tripRuleIssues, type PackageRules } from "@/lib/packageRules";
import type { TourOption } from "@/types";
import type { DayPlan, TripInput } from "@/types";

/** 일정 카드가 그날 규칙 점검·종료 기준에 쓰는 이 상품의 규칙 */
export const PackageRulesContext = createContext<PackageRules | null>(null);

const OPTION_TEXT: Record<PackageRules["options"], string> = { allowed: "있음 (기본일정 뒤, 대체일정 표기)", reasonable: "합리적 가격 (기본일정 뒤)", included: "주요 옵션 포함 (노옵션)", none: "없음" };

/** 상품 규칙 — 운영 방식·등급·고객·지역으로 정한 기준과 상품 전체 점검 */
export function PackageRulesPanel({ input, rules, days, pmChoice, onApplyDays, onOptions }: { input: TripInput; rules: PackageRules; days: DayPlan[]; pmChoice: PmChoice; onApplyDays?: (days: DayPlan[]) => void; onOptions?: (options: TourOption[]) => void }) {
  const issues = tripRuleIssues(input, days, pmChoice, rules);
  const [message, setMessage] = useState("");
  const rows: [string, string][] = [
    ["미팅", `${rules.meeting} (${rules.earliestMeeting} 이전 출발 없음)`],
    ...(rules.placesPerDay[1] > 0 ? ([["하루 장소", `${rules.placesPerDay[0] === rules.placesPerDay[1] ? rules.placesPerDay[0] : `${rules.placesPerDay[0]}~${rules.placesPerDay[1]}`}곳 · 첫날 ${rules.firstDayMax}곳 이내`]] as [string, string][]) : []),
    ["한 번 이동", `${rules.maxRideMinutes}분 이내`],
    ...(rules.walkKmMax ? ([["걷기", `하루 ${rules.walkKmMax}km 이내`]] as [string, string][]) : []),
    ["종료", `${rules.dayEnd}까지${rules.eveningOk ? " (저녁 일정 정상)" : ""}`],
    ["자유시간", `${Math.round(rules.freeShare[0] * 100)}~${Math.round(rules.freeShare[1] * 100)}%`],
    ["식사", `${rules.meals}${rules.specialMealsMin > 0 ? ` · 특식 ${rules.specialMealsMin}회 이상` : ""}`],
    ["숙소", rules.minNightsPerHotel > 1 ? `한 숙소 ${rules.minNightsPerHotel}연박 이상 · 체크인 ${rules.checkIn}` : `체크인 ${rules.checkIn}`],
    ["쇼핑", rules.shoppingMax === null ? "있음 — 하루 1회, 첫날·출국 직전 피함" : rules.shoppingMax === 0 ? "노쇼핑 (시장·야시장 관광은 괜찮음)" : `최대 ${rules.shoppingMax}회 — 하루 1회, 첫날·출국 직전 피함`],
    ["선택관광", OPTION_TEXT[rules.options]],
    ["가이드 경비", rules.tipsIncluded ? "포함 (노팁)" : "별도 (현지 지불 표기)"],
    ["운전", rules.driving.basis],
    ["공항", `국제선 출발 ${rules.airportBefore / 60}시간 전 도착`],
  ];
  return (
    <SectionCard
      title="상품 규칙"
      description="운영 방식·등급·고객·지역으로 정한 기준 — AI 일정과 일정 카드 점검이 이 기준을 씁니다"
      icon={ClipboardCheck}
      collapsible
      defaultOpen={issues.length > 0}
      summary={`${rules.label} · ${REGION_LABEL[rules.region]}${issues.length > 0 ? ` · 확인 ${issues.length}` : " · 기준 충족"}`}
      anchorId="package-rules"
    >
      <div className="space-y-3 text-xs">
        <p className="font-semibold text-slate-800">
          {rules.label} <span className="font-normal text-slate-500">· {REGION_LABEL[rules.region]}</span>
        </p>
        {onApplyDays && (
          <button
            type="button"
            onClick={() => {
              const r = applyPackageRules(days, pmChoice, rules, input);
              if (r.changes.length > 0) onApplyDays(r.days);
              setMessage(
                `${r.changes.length > 0 ? `규칙대로 정리했습니다 — ${r.changes.join(" / ")}.` : "자동으로 고칠 것이 없습니다."}${r.left.length > 0 ? ` 남은 확인 ${r.left.length}건은 상품 판단이 필요합니다 (아래·일정 카드).` : ""}`,
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <ClipboardCheck className="size-3.5" aria-hidden />
            규칙대로 정리
          </button>
        )}
        {issues.length > 0 && (
          <ul aria-label="상품 규칙 점검" className="space-y-1.5">
            {issues.map((i) => (
              <li key={i.key} className="flex flex-wrap items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-900">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 text-pretty">{i.text}</span>
                {i.separateIds && onApplyDays && onOptions && (
                  <button
                    type="button"
                    onClick={() => {
                      const r = toOptionalTours(days, i.separateIds!);
                      onApplyDays(r.days);
                      onOptions([...input.options.filter((o) => !r.options.some((x) => x.id === o.id)), ...r.options]);
                      setMessage(`${r.options.map((o) => o.name).join(", ")}을(를) 선택관광으로 옮겼습니다 (현지 별도 결제, 미참여 시 대체일정 표기).`);
                    }}
                    className="shrink-0 rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold hover:bg-amber-100"
                  >
                    선택관광으로 옮기기
                  </button>
                )}
                {i.meetingDays && onApplyDays && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyDays(applyRuleMeeting(days, i.meetingDays!, rules));
                      setMessage(`DAY ${i.meetingDays!.join("·")} 미팅을 ${rules.meeting}로 바꿨습니다.`);
                    }}
                    className="shrink-0 rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold hover:bg-amber-100"
                  >
                    {rules.meeting} 미팅으로
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {message && (
          <p role="status" className="text-emerald-700">
            {message}
          </p>
        )}
        <table aria-label="상품 기준" className="w-full text-left">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-t border-slate-100 align-top">
                <th scope="row" className="w-24 py-1 pr-2 font-medium text-slate-500">
                  {k}
                </th>
                <td className="py-1 text-pretty text-slate-800">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul aria-label="기획 원칙" className="list-disc space-y-0.5 pl-4 text-pretty text-slate-600">
          {rules.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-400">대형 여행사 등급 체계·국외여행 표준약관·정보제공 표준안·지역 운전 규정을 바탕으로 한 기본값입니다. 바꾸려면 입력의 운영 방식·등급·고객 유형을 고르세요.</p>
      </div>
    </SectionCard>
  );
}
