import { Calendar, Download, FolderOpen, Loader2, Trash2 } from "lucide-react";
import type { PlanIndexEntry } from "@/lib/workspace";
import type { ItineraryItem } from "@/types";

/** 저장된 일정 한 줄 — 불러오기·날짜만 가져오기·내려받기·삭제(확인 포함) */

function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  entry: PlanIndexEntry;
  /** 이 일정으로 성약한 예약 수 (예약 관리) */
  won?: number;
  /** 확인을 기다리는 동작 (지금 작업을 덮어쓰는 불러오기, 삭제) */
  confirming: "load" | "delete" | null;
  busy: boolean;
  /** 저장하지 않은 변경이 있으면 불러오기 전에 한 번 묻는다 */
  dirty: boolean;
  isCloud: boolean;
  /** 펼친 "날짜만 가져오기" 목록 (닫혀 있으면 undefined) */
  importDays: { theme: string; items: ItineraryItem[] }[] | undefined;
  importLoading: boolean;
  onAsk: (action: "load" | "delete") => void;
  onCancel: () => void;
  onLoad: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onToggleImport: () => void;
  onImportDay: (theme: string, items: ItineraryItem[]) => void;
}

export function SavedPlanEntry({ entry, won = 0, confirming, busy, dirty, isCloud, importDays, importLoading, onAsk, onCancel, onLoad, onDelete, onDownload, onToggleImport, onImportDay }: Props) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <span className="truncate">{entry.name}</span>
            {won > 0 && <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">잘 팔린 코스 · 성약 {won}건</span>}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{entry.summary}</p>
          <p className="text-[11px] text-slate-400">
            저장 {formatSavedAt(entry.savedAt)}
            {entry.author ? ` · ${entry.author}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => onDownload()} aria-label={`${entry.name} 파일로 내려받기`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <Download className="h-4 w-4" aria-hidden />
          </button>
          {entry.canDelete !== false && (
            <button
              type="button"
              onClick={() => onAsk("delete")}
              aria-label={`${entry.name} 삭제`}
              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {confirming === null && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => (dirty ? onAsk("load") : onLoad())}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden />
            불러오기
          </button>
          <button
            type="button"
            onClick={() => onToggleImport()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {importLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Calendar className="h-3.5 w-3.5" aria-hidden />}
            날짜만 가져오기
          </button>
        </div>
      )}
      {importDays && (
        <div className="mt-2 space-y-1.5 rounded-md bg-slate-50 p-2">
          {importDays.length === 0 ? (
            <p className="text-[11px] text-slate-500">이 일정에는 아직 날짜가 없습니다.</p>
          ) : (
            importDays.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 ring-1 ring-slate-200">
                <span className="min-w-0 truncate text-[11px] text-slate-700">
                  {d.theme} <span className="text-slate-400">({d.items.length}곳)</span>
                </span>
                <button
                  type="button"
                  onClick={() => onImportDay(d.theme, d.items)}
                  disabled={d.items.length === 0}
                  className="shrink-0 rounded border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  가져오기
                </button>
              </div>
            ))
          )}
        </div>
      )}
      {confirming === "load" && (
        <div className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
          저장하지 않은 변경이 있습니다. 불러오면 지금 화면의 일정과 입력값이 바뀝니다.
          <span className="mt-1.5 flex gap-2">
            <button type="button" onClick={() => onLoad()} className="rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700">
              그래도 불러오기
            </button>
            <button type="button" onClick={() => onCancel()} className="rounded-md border border-amber-300 bg-white px-2 py-1 font-medium text-amber-800">
              취소
            </button>
          </span>
        </div>
      )}
      {confirming === "delete" && (
        <div className="mt-2 rounded-md bg-red-50 px-2.5 py-2 text-[11px] leading-4 text-red-700">
          &quot;{entry.name}&quot;을(를) 삭제할까요? 되돌릴 수 없습니다.
          {isCloud && " 서버에서 지우면 다른 기기에서도 사라집니다."}
          <span className="mt-1.5 flex gap-2">
            <button type="button" onClick={() => onDelete()} className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700">
              삭제
            </button>
            <button type="button" onClick={() => onCancel()} className="rounded-md border border-red-200 bg-white px-2 py-1 font-medium text-red-700">
              취소
            </button>
          </span>
        </div>
      )}
    </li>
  );
}
