import { SlidersHorizontal } from "lucide-react";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Field } from "@/components/ui/Field";
import { SectionCard } from "@/components/ui/SectionCard";
import { TextField } from "@/components/ui/TextField";
import { COMPANIONS, PACES, THEMES, TRAVEL_TYPES } from "@/lib/defaults";
import type { Companion, ThemeId, TravelType } from "@/types";
import type { SectionProps } from "./types";

/** 고급: AI가 일정을 만들 때 참고할 상세 조건 — 여행 유형, 방문 지역 순서, 선호 테마, 추가 요청사항 */
export function DetailConditionsSection({ input, onChange }: SectionProps) {
  const travelTypeLabel = TRAVEL_TYPES.find((t) => t.id === input.travelType)?.label ?? "";
  const summary = [
    travelTypeLabel,
    `강도 ${PACES.find((p) => p.id === input.pace)?.label ?? "보통"}`,
    input.companions.length > 0 ? COMPANIONS.filter((c) => input.companions.includes(c.id)).map((c) => c.label).join("·") : "",
    input.themes.length > 0 ? `테마 ${input.themes.length}개` : "",
    input.regionPlan.trim() ? "지역 순서 지정" : "",
    input.notes.trim() ? "요청사항 있음" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const toggleCompanion = (id: Companion) => onChange({ companions: input.companions.includes(id) ? input.companions.filter((c) => c !== id) : [...input.companions, id] });
  const toggleTheme = (id: ThemeId) => onChange({ themes: input.themes.includes(id) ? input.themes.filter((t) => t !== id) : [...input.themes, id] });

  return (
    <SectionCard
      anchorId="detail-conditions"
      title="일정 상세 조건 (AI 일정용)"
      description="여행 유형·지역 순서·테마·요청사항을 일정에 반영합니다"
      icon={SlidersHorizontal}
      collapsible
      nested
      defaultOpen={false}
      summary={summary}
    >
      <div className="space-y-4">
        <Field htmlFor="travelType" label="여행 유형" hint="유형에 맞는 특징을 웹에서 조사해 일정에 반영합니다">
          <div id="travelType" role="radiogroup" aria-label="여행 유형" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {TRAVEL_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={input.travelType === t.id}
                onClick={() => onChange({ travelType: t.id as TravelType })}
                className={`rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                  input.travelType === t.id ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-indigo-300"
                }`}
              >
                <span className="block text-xs font-semibold text-slate-800">{t.label}</span>
                <span className="mt-0.5 block text-pretty text-[11px] leading-4 text-slate-500">{t.hint}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field htmlFor="pace" label="일정 강도" hint="힘든 날(장거리·긴 하루) 다음 날은 늦은 출발·반나절 자유로 가볍게 합니다">
          <div id="pace" role="radiogroup" aria-label="일정 강도" className="grid grid-cols-3 gap-1.5">
            {PACES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={input.pace === p.id}
                onClick={() => onChange({ pace: p.id })}
                className={`rounded-md border px-2 py-1.5 text-left ${input.pace === p.id ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-indigo-300"}`}
              >
                <span className="block text-xs font-semibold text-slate-800">{p.label}</span>
                <span className="mt-0.5 block text-pretty text-[10.5px] leading-4 text-slate-500">{p.hint}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field htmlFor="companions" label="동반자" hint="걷는 양·쉬는 시간·식사를 맞춥니다 (여러 개)">
          <div id="companions" className="flex flex-wrap gap-1.5">
            {COMPANIONS.map((c) => (
              <ChipToggle key={c.id} label={c.label} selected={input.companions.includes(c.id)} onToggle={() => toggleCompanion(c.id)} />
            ))}
          </div>
        </Field>
        <TextField id="mustHave" label="꼭 넣고 싶은 것 (선택)" value={input.mustHave} placeholder="예) 바나힐 골든브릿지, 야시장, 한식 1번" onChange={(mustHave) => onChange({ mustHave: mustHave.slice(0, 300) })} />
        <TextField id="avoid" label="피하고 싶은 것 (선택)" value={input.avoid} placeholder="예) 쇼핑센터, 긴 도보, 해산물" onChange={(avoid) => onChange({ avoid: avoid.slice(0, 300) })} />

        <TextField
          id="regionPlan"
          label="방문 지역 순서 (선택)"
          multiline
          value={input.regionPlan}
          placeholder="예) 로마 2일, 피렌체 2일, 베니스 2일 (비워두면 AI가 알아서 도시를 구성합니다)"
          onChange={(regionPlan) => onChange({ regionPlan })}
        />

        <Field htmlFor="themes" label="선호 테마" hint="여러 개 선택할 수 있습니다">
          <div id="themes" className="flex flex-wrap gap-1.5">
            {THEMES.map((theme) => (
              <ChipToggle key={theme.id} label={theme.label} selected={input.themes.includes(theme.id)} onToggle={() => toggleTheme(theme.id)} />
            ))}
          </div>
        </Field>
        <TextField
          id="notes"
          label="추가 요청사항"
          multiline
          value={input.notes}
          placeholder="예) 시니어 고객 위주, 도보 이동 최소화, 채식 옵션 필요"
          onChange={(notes) => onChange({ notes })}
        />
      </div>
    </SectionCard>
  );
}
