interface Option<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

interface Props<T extends string> {
  /** 같은 화면의 다른 묶음과 겹치지 않는 이름 (radio name) */
  name: string;
  /** 화면 읽기 프로그램용 묶음 이름 */
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  /** cards: 설명이 붙은 칸 / segmented: 한 줄 버튼 묶음 */
  variant?: "cards" | "segmented";
  /** cards일 때 한 줄 칸 수 */
  columns?: 2 | 3;
}

const GRID = { 2: "grid-cols-2", 3: "grid-cols-3" } as const;

/**
 * 하나만 고르는 선택지 — 브라우저 기본 라디오 버튼을 써서 화살표 키·Tab·화면 읽기 프로그램이 그대로 동작한다
 * (버튼에 role="radio"만 붙이면 화살표 키 이동이 안 된다). 모양만 칸/버튼처럼 꾸민다.
 */
export function ChoiceGroup<T extends string>({ name, label, value, options, onChange, variant = "cards", columns = 2 }: Props<T>) {
  if (variant === "segmented") {
    return (
      <fieldset className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
        <legend className="sr-only">{label}</legend>
        {options.map((o) => (
          <label
            key={o.id}
            title={o.hint}
            className="cursor-pointer px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 has-[:checked]:bg-indigo-600 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-indigo-400"
          >
            <input type="radio" className="sr-only" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <fieldset className={`grid ${GRID[columns]} gap-2`}>
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <label
          key={o.id}
          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-300 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50 has-[:checked]:ring-1 has-[:checked]:ring-indigo-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-400"
        >
          <input type="radio" className="sr-only" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
          <span className={`block text-xs font-semibold ${value === o.id ? "text-indigo-800" : "text-slate-700"}`}>{o.label}</span>
          {o.hint && <span className="mt-0.5 block text-pretty text-[10px] leading-3 text-slate-500">{o.hint}</span>}
        </label>
      ))}
    </fieldset>
  );
}
