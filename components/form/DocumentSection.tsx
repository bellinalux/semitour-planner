"use client";

import { AlertTriangle, FileText, Loader2, ShieldAlert } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { TextField } from "@/components/ui/TextField";
import { useRequest } from "@/hooks/useRequest";
import { ALERT_LABELS, alertTone } from "@/lib/travelAlert";
import type { TravelAlert } from "@/types";
import type { SectionProps } from "./types";

/** 여행경보 직접 입력 선택지 */
const LEVELS = [0, 1, 2, 3, 4];

export function DocumentSection({ input, onChange }: SectionProps) {
  const { state, run } = useRequest<{ destination: string }, { alert: TravelAlert }>("/api/travel-alert");
  const alert = input.travelAlert;

  const lookup = async () => {
    const result = await run({ destination: input.destination.trim() });
    if (result) onChange({ travelAlert: result.alert });
  };

  const setLevel = (level: number) =>
    onChange({
      travelAlert: {
        country: alert?.country || input.destination.trim(),
        level,
        levelLabel: ALERT_LABELS[level] ?? ALERT_LABELS[0],
        note: "",
        checkedAt: new Date().toISOString(),
        source: "manual",
      },
    });

  return (
    <SectionCard title="고객 문서 정보" description="일정표·견적서·청구서를 인쇄할 때 쓰는 값입니다" icon={FileText}>
      <div className="space-y-4">
        <TextField
          id="customerName"
          label="수신처 (고객명·단체명)"
          value={input.customerName}
          placeholder="예) 김○○ 님 / ○○산악회"
          onChange={(customerName) => onChange({ customerName })}
        />

        <div className="space-y-1.5">
          <div role="radiogroup" aria-label="견적서·계약서 발급 단위" className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
            {(
              [
                { individual: false, label: "단체 문서 1부" },
                { individual: true, label: "개인별로 각각" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={(input.travelerNames.length > 0) === opt.individual}
                onClick={() => onChange({ travelerNames: opt.individual ? (input.travelerNames.length > 0 ? input.travelerNames : [""]) : [] })}
                className={`px-2.5 py-1.5 text-[11px] font-medium ${
                  (input.travelerNames.length > 0) === opt.individual ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-4 text-slate-500">
            &quot;개인별로 각각&quot;을 고르면 아래 이름마다 1인 기준 견적서·계약서를 따로 만듭니다(같은 인쇄물 안에서 사람마다 새 문서로 나뉩니다). 청구서·일정표는 지금처럼 한 부만 나옵니다.
          </p>
          {input.travelerNames.length > 0 && (
            <div className="space-y-1">
              <label htmlFor="travelerNames" className="block text-[11px] font-medium text-slate-600">
                여행자 명단 (한 줄에 한 명)
              </label>
              <textarea
                id="travelerNames"
                rows={Math.min(8, Math.max(3, input.travelerNames.length + 1))}
                value={input.travelerNames.join("\n")}
                placeholder={"예)\n김○○\n이○○\n박○○"}
                onChange={(e) => onChange({ travelerNames: e.target.value.split("\n") })}
                className={`${inputClass} resize-y font-normal`}
              />
              <p className="text-[11px] text-slate-400">
                빈 줄은 무시합니다. 지금 {input.travelerNames.map((n) => n.trim()).filter(Boolean).length}명 입력됨 (견적 인원 {input.travelers}명과 다를 수 있습니다).
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor="departureDate" label="출발일" hint="비우면 문서에 '미정'으로 표시됩니다">
            <input
              id="departureDate"
              type="date"
              value={input.departureDate}
              onChange={(e) => onChange({ departureDate: e.target.value })}
              className={inputClass}
            />
          </Field>
          <NumberField
            id="minTravelers"
            label="최저 행사인원"
            value={input.minTravelers}
            min={0}
            max={200}
            step={1}
            suffix="명"
            hint="0이면 문서에 표시하지 않습니다"
            onChange={(minTravelers) => onChange({ minTravelers })}
          />
        </div>
        {input.minTravelers > 0 && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">
            최저 행사인원에 미달해 취소할 때는 출발 7일 전까지 통지해야 합니다. 늦으면 하루 전 통지 30%, 당일 통지 50%를 배상해야 합니다(국외여행 표준약관).
          </p>
        )}

        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <ShieldAlert className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              여행경보단계
            </span>
            <button
              type="button"
              onClick={() => void lookup()}
              disabled={input.destination.trim() === "" || state.status === "loading"}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.status === "loading" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
              외교부 조회
            </button>
          </div>
          <p className="text-[11px] leading-4 text-slate-500">
            기획여행 안내에 표시해야 하는 법정 항목입니다(관광진흥법 시행규칙 제21조 제8호).
          </p>

          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={alert?.level === level}
                onClick={() => setLevel(level)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  alert?.level === level ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"
                }`}
              >
                {ALERT_LABELS[level]}
              </button>
            ))}
          </div>

          {state.status === "error" && (
            <p role="alert" className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {state.error ?? "조회하지 못했습니다. 위에서 직접 선택해 주세요."}
            </p>
          )}

          {alert && (
            <p className={`rounded-md px-2.5 py-2 text-[11px] leading-4 ${alertTone(alert.level)}`}>
              <span className="font-semibold">
                {alert.country || input.destination.trim()} · {alert.levelLabel}
              </span>
              {alert.note ? ` · ${alert.note}` : ""}
              <span className="text-slate-500"> ({alert.source === "api" ? "외교부 조회" : "직접 입력"})</span>
              {alert.level >= 4 && <span className="mt-1 block font-semibold">여행금지 국가입니다. 방문 시 여권법 위반이 될 수 있어 상품 판매 전에 반드시 확인하세요.</span>}
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
