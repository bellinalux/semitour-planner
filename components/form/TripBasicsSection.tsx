import { MapPin } from "lucide-react";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Field } from "@/components/ui/Field";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { TextField } from "@/components/ui/TextField";
import { THEMES, TRAVEL_TYPES } from "@/lib/defaults";
import { tourDayCount } from "@/lib/itinerary";
import type { CourseFile } from "@/lib/courseFile";
import type { ThemeId, TravelType } from "@/types";
import { CoursePasteField } from "./CoursePasteField";
import { ModeSwitch } from "./ModeSwitch";
import type { SectionProps } from "./types";

interface Props extends SectionProps {
  courseFile: CourseFile | null;
  onCourseFileChange: (file: CourseFile | null) => void;
}

export function TripBasicsSection({ input, onChange, courseFile, onCourseFileChange }: Props) {
  const isPaste = input.mode === "paste";

  const toggleTheme = (id: ThemeId) =>
    onChange({
      themes: input.themes.includes(id) ? input.themes.filter((t) => t !== id) : [...input.themes, id],
    });

  // 박수가 "일수 − 1"(당일 귀국)이던 상태에서 일수를 바꾸면 박수도 함께 따라간다
  const changeDays = (days: number) =>
    onChange({ days, nights: input.nights === input.days - 1 ? Math.max(0, days - 1) : input.nights });

  return (
    <SectionCard
      title="여행 기본 정보"
      description={isPaste ? "붙여넣은 코스에서 기간과 도시를 자동으로 읽습니다" : "AI가 일정을 만들 때 사용합니다"}
      icon={MapPin}
    >
      <div className="space-y-4">
        <ModeSwitch value={input.mode} onChange={(mode) => onChange({ mode })} />

        {isPaste && (
          <CoursePasteField
            value={input.courseText}
            onChange={(courseText) => onChange({ courseText })}
            file={courseFile}
            onFileChange={onCourseFileChange}
          />
        )}

        <TextField
          id="destination"
          label={isPaste ? "여행지 (코스에서 자동 인식)" : "여행지"}
          value={input.destination}
          placeholder="예) 교토, 일본 / 리스본, 포르투갈"
          onChange={(destination) => onChange({ destination })}
        />

        <div className="grid grid-cols-3 gap-3">
          <NumberField
            id="nights"
            label="숙박"
            value={input.nights}
            min={0}
            max={30}
            step={1}
            suffix="박"
            onChange={(nights) => onChange({ nights })}
          />
          <NumberField
            id="days"
            label="총 일수"
            value={input.days}
            min={1}
            max={14}
            step={1}
            suffix="일"
            onChange={changeDays}
          />
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
        <p className="-mt-2 text-[11px] leading-4 text-slate-500">
          {input.nights}박 {input.days}일 · 귀국 항공이 밤 비행기라 기내에서 하루를 보내면 숙박이 일수 − 2가 됩니다.
        </p>

        {!isPaste && (
          <>
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
                      input.travelType === t.id
                        ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                        : "border-slate-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <span className="block text-xs font-semibold text-slate-800">{t.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{t.hint}</span>
                  </button>
                ))}
              </div>
            </Field>

            <TextField
              id="regionPlan"
              label="방문 지역 순서 (선택)"
              multiline
              value={input.regionPlan}
              placeholder="예) 로마 2일, 피렌체 2일, 베니스 2일 (비워두면 AI가 알아서 도시를 구성합니다)"
              onChange={(regionPlan) => onChange({ regionPlan })}
            />

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={input.includesFlights}
                  onChange={(e) => onChange({ includesFlights: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="block text-xs font-medium text-slate-800">항공 이동일 포함 (해외 패키지)</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                    첫날(출발·도착)과 마지막 날(귀국)은 이동일로 두고, 그 사이 {tourDayCount(input)}일만 AI가 관광 일정을 만듭니다.
                    {input.includesFlights && input.days < 3 && (
                      <span className="font-medium text-red-600"> 총 일수는 3일 이상이어야 합니다.</span>
                    )}
                  </span>
                </span>
              </label>
              {input.includesFlights && input.packageType !== "full" && (
                <div className="mt-3">
                  <TextField
                    id="originCity"
                    label="출발지"
                    value={input.originCity}
                    placeholder="예) 인천"
                    onChange={(originCity) => onChange({ originCity })}
                  />
                </div>
              )}
            </div>

            <Field htmlFor="themes" label="선호 테마" hint="여러 개 선택할 수 있습니다">
              <div id="themes" className="flex flex-wrap gap-1.5">
                {THEMES.map((theme) => (
                  <ChipToggle
                    key={theme.id}
                    label={theme.label}
                    selected={input.themes.includes(theme.id)}
                    onToggle={() => toggleTheme(theme.id)}
                  />
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
          </>
        )}
      </div>
    </SectionCard>
  );
}
