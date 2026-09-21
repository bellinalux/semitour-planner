import { Field, inputClass } from "@/components/ui/Field";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const MAX_LENGTH = 12000;

export function CoursePasteField({ value, onChange }: Props) {
  const length = value.length;

  return (
    <Field
      htmlFor="courseText"
      label="업체 코스 원문"
      hint="DAY 1, DAY 2처럼 일차가 구분된 코스를 그대로 붙여넣으세요. 이모지와 화살표가 있어도 됩니다. 붙여넣은 뒤 결과 화면에서 AI가 잘못 읽은 항목을 고칠 수 있습니다."
    >
      <textarea
        id="courseText"
        rows={10}
        value={value}
        maxLength={MAX_LENGTH}
        placeholder={"예)\nDAY 1\n✈️ 인천 출발\n↓\n방콕 도착\n↓\n🏨 파타야 5성급 리조트 체크인\n\nDAY 2\n🏝️ ① 산호섬\n↓\n🛕 ② 진리의 성전"}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} resize-y font-mono text-xs leading-5`}
      />
      <p className="mt-1 text-right text-[11px] tabular-nums text-slate-400">
        {length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}자
      </p>
    </Field>
  );
}
