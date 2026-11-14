import { Field, inputClass } from "./Field";
import { fastPaste } from "@/lib/fastPaste";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
}

export function TextField({ id, label, value, onChange, placeholder, hint, multiline }: Props) {
  return (
    <Field htmlFor={id} label={label} hint={hint}>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onPaste={fastPaste(onChange)}
          className={`${inputClass} resize-y`}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  );
}
