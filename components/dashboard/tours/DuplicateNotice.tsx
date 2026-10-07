import { AlertTriangle, Check, X } from "lucide-react";

export interface PendingDuplicates {
  newItemName: string;
  matches: { id: string; name: string; checked: boolean }[];
}

/** 새로 넣은 투어와 겹치는 것 같은 기존 코스 — 지울 항목을 사람이 고른다(자동 삭제 없음) */
export function DuplicateNotice({
  pending,
  onToggle,
  onConfirm,
  onCancel,
}: {
  pending: PendingDuplicates;
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-900">
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        &quot;{pending.newItemName}&quot;와(과) 겹치는 것 같은 코스가 이미 일정에 있습니다. 지울 항목을 확인하세요.
      </p>
      <ul className="space-y-1">
        {pending.matches.map((m) => (
          <li key={m.id}>
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-amber-900">
              <input type="checkbox" checked={m.checked} onChange={() => onToggle(m.id)} className="h-3.5 w-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500" />
              {m.name}
            </label>
          </li>
        ))}
      </ul>
      <p className="text-[10px] leading-4 text-amber-700">
        낮투어·야경투어처럼 시간대나 체험이 다른 코스는 겹쳐도 자동으로 걸러지지 않았을 수 있습니다. 지울 항목만 체크한 뒤 삭제하세요.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!pending.matches.some((m) => m.checked)}
          className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          선택 삭제
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          그대로 두기
        </button>
      </div>
    </div>
  );
}
