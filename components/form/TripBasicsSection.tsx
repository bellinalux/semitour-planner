import { MapPin } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { TextField } from "@/components/ui/TextField";
import { isKoreanDestination } from "@/lib/korea";
import type { CourseFile } from "@/lib/courseFile";
import { CoursePasteField } from "./CoursePasteField";
import { QuickStartPresets } from "./QuickStartPresets";
import { CompanyTemplates } from "./CompanyTemplates";
import { ModeSwitch } from "./ModeSwitch";
import { TripScopeSwitch } from "./TripScopeSwitch";
import { PackageKindFields } from "./PackageKindFields";
import type { SectionProps } from "./types";
import { isShortHaul } from "@/lib/flightPlan";

interface Props extends SectionProps {
  courseFile: CourseFile | null;
  onCourseFileChange: (file: CourseFile | null) => void;
}

/** 폴더 1. 여행 기본 — 입력 방식, 여행지, 기간, 인원, 출발일·출발지 (코스를 만들 때 꼭 필요한 것만) */
export function TripBasicsSection({ input, onChange, courseFile, onCourseFileChange, foldSignal }: Props) {
  const isPaste = input.mode === "paste";

  // 여행지가 한국 지명이면 국내여행(항공 이동일 없음)으로, 한국 지명을 지우면 다시 해외여행으로 자동 전환한다
  const changeDestination = (destination: string) => {
    const nowKorean = isKoreanDestination(destination);
    const wasKorean = isKoreanDestination(input.destination);
    if (nowKorean && input.tripScope !== "domestic") onChange({ destination, tripScope: "domestic", includesFlights: false });
    else if (!nowKorean && wasKorean && input.tripScope === "domestic") onChange({ destination, tripScope: "overseas" });
    else onChange({ destination });
  };

  // 박수가 "일수 − 1"(당일 귀국)이던 상태에서 일수를 바꾸면 박수도 함께 따라간다
  const changeDays = (days: number) => onChange({ days, nights: input.nights === input.days - 1 ? Math.max(0, days - 1) : input.nights });
  // 숙박을 바꾸면 총 일수도 따라간다 — 기본 숙박+1일, 장거리 심야 귀국편(숙박+2일)이던 상품만 숙박+2일 유지
  // (예전엔 숙박만 바뀌어 3박4일 → 2박4일처럼 맞지 않는 기간이 생겼다)
  const shortHaul = input.tripScope === "overseas" && isShortHaul(input);
  const changeNights = (nights: number) => {
    const overnight = input.days === input.nights + 2 && !shortHaul;
    onChange({ nights, days: Math.min(14, Math.max(1, nights + (overnight ? 2 : 1))) });
  };
  const span = input.days - input.nights;
  const periodWarning =
    input.tripScope === "overseas" && input.includesFlights && shortHaul && span === 2
      ? `가까운 노선(비행 5시간 이하)은 귀국편에서 기내 1박이 생기지 않습니다. ${input.nights}박 ${input.days}일이면 하루가 남아 빈 날이 생깁니다.`
      : span > 2 || span < 1
        ? `숙박 ${input.nights}박과 총 ${input.days}일이 맞지 않습니다 (보통 숙박+1일, 심야 귀국편이면 숙박+2일).`
        : "";

  const summary = [
    input.destination.trim() || "여행지 미정",
    `${input.nights}박 ${input.days}일`,
    `${input.travelers}명`,
    input.departureDate ? `${input.departureDate.slice(5).replace("-", "/")} 출발` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SectionCard
      title="1. 여행 기본"
      description={isPaste ? "붙여넣은 코스에서 기간과 도시를 자동으로 읽습니다" : "여행지·기간·인원만 넣으면 됩니다"}
      icon={MapPin}
      collapsible
      summary={summary}
      foldSignal={foldSignal}
    >
      <div className="space-y-4">
        <ModeSwitch value={input.mode} onChange={(mode) => onChange({ mode })} />
        <TripScopeSwitch value={input.tripScope} onChange={(tripScope) => onChange({ tripScope })} />
        <PackageKindFields input={input} onChange={onChange} />
        <CompanyTemplates input={input} onChange={onChange} />

        {isPaste && (
          <CoursePasteField value={input.courseText} onChange={(courseText) => onChange({ courseText })} file={courseFile} onFileChange={onCourseFileChange} />
        )}

        <TextField
          id="destination"
          label={isPaste ? "여행지 (코스에서 자동 인식)" : "여행지"}
          value={input.destination}
          placeholder="예) 교토, 일본 / 리스본, 포르투갈"
          onChange={changeDestination}
        />

        <div className="grid grid-cols-3 gap-3">
          <NumberField id="nights" label="숙박" value={input.nights} min={0} max={30} step={1} suffix="박" onChange={changeNights} />
          <NumberField id="days" label="총 일수" value={input.days} min={1} max={14} step={1} suffix="일" onChange={changeDays} />
          <NumberField
            id="travelers"
            label="예상 인원"
            value={input.travelers}
            min={1}
            max={50}
            step={1}
            suffix="명"
            onChange={(travelers) => onChange({ travelers })}
          />
        </div>
        <p className="-mt-2 text-pretty text-[11px] leading-4 text-slate-500">
          {input.nights}박 {input.days}일 · 숙박을 바꾸면 일수도 따라 바뀝니다. 장거리 심야 귀국편(기내 1박)만 숙박이 일수 − 2입니다.
        </p>
        {periodWarning && (
          <div role="alert" className="-mt-1 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
            <span className="min-w-0 flex-1">{periodWarning}</span>
            <button
              type="button"
              onClick={() => onChange({ days: Math.min(14, input.nights + 1) })}
              className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100"
            >
              {input.nights}박 {input.nights + 1}일로 맞추기
            </button>
          </div>
        )}

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
          {input.tripScope === "overseas" && (
            <TextField
              id="originCity"
              label="출발지 (항공)"
              value={input.originCity}
              placeholder="예) 인천"
              onChange={(originCity) => onChange({ originCity })}
            />
          )}
        </div>

        {!isPaste && <QuickStartPresets input={input} onChange={onChange} />}
      </div>
    </SectionCard>
  );
}
