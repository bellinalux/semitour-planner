import { MapPin } from "lucide-react";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Field } from "@/components/ui/Field";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { TextField } from "@/components/ui/TextField";
import { THEMES } from "@/lib/defaults";
import type { ThemeId } from "@/types";
import type { SectionProps } from "./types";

export function TripBasicsSection({ input, onChange }: SectionProps) {
  const toggleTheme = (id: ThemeId) =>
    onChange({
      themes: input.themes.includes(id)
        ? input.themes.filter((t) => t !== id)
        : [...input.themes, id],
    });

  return (
    <SectionCard title="여행 기본 정보" description="AI가 일정을 만들 때 사용합니다" icon={MapPin}>
      <div className="space-y-4">
        <TextField
          id="destination"
          label="여행지"
          value={input.destination}
          placeholder="예) 교토, 일본 / 리스본, 포르투갈"
          onChange={(destination) => onChange({ destination })}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id="days"
            label="여행 기간"
            value={input.days}
            min={1}
            max={14}
            step={1}
            suffix="일"
            onChange={(days) => onChange({ days })}
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
      </div>
    </SectionCard>
  );
}
