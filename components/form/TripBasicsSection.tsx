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
import type { SectionProps } from "./types";

interface Props extends SectionProps {
  courseFile: CourseFile | null;
  onCourseFileChange: (file: CourseFile | null) => void;
}

/** 폴더 1. 여행 기본 — 입력 방식, 여행지, 기간, 인원, 출발일·출발지 (코스를 만들 때 꼭 필요한 것만) */
export function TripBasicsSection({ input, onChange, courseFile, onCourseFileChange }: Props) {
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
    >
      <div className="space-y-4">
        <ModeSwitch value={input.mode} onChange={(mode) => onChange({ mode })} />
        <TripScopeSwitch value={input.tripScope} onChange={(tripScope) => onChange({ tripScope })} />
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
          <NumberField id="nights" label="숙박" value={input.nights} min={0} max={30} step={1} suffix="박" onChange={(nights) => onChange({ nights })} />
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
          {input.nights}박 {input.days}일 · 귀국 항공이 밤 비행기라 기내에서 하루를 보내면 숙박이 일수 − 2가 됩니다.
        </p>

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
