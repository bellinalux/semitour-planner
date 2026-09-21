import { ClipboardCopy } from "lucide-react";

interface Props {
  disabled: boolean;
}

/** Step 4에서 내부용/고객용 복사 기능을 연결한다. */
export function ExportBar({ disabled }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">
        완성된 일정과 견적을 텍스트로 복사해 카톡·메일에 바로 붙여넣을 수 있습니다.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ClipboardCopy className="h-4 w-4" aria-hidden />
          내부용 복사
        </button>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ClipboardCopy className="h-4 w-4" aria-hidden />
          고객용 복사
        </button>
      </div>
    </div>
  );
}
