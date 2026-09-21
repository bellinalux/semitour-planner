interface Props {
  label: string;
  selected: boolean;
  onToggle: () => void;
}

export function ChipToggle({ label, selected, onToggle }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        selected
          ? "border-indigo-600 bg-indigo-600 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
      }`}
    >
      {label}
    </button>
  );
}
