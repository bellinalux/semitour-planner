"use client";

import { AlertTriangle, Check, Download, FolderOpen, Save, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSavedPlans } from "@/hooks/useSavedPlans";
import {
  fileNameFor,
  MAX_FILE_BYTES,
  MAX_NAME_LENGTH,
  newPlanId,
  parsePlanFile,
  planSummary,
  serializePlanFile,
  suggestPlanName,
  type PlanSnapshot,
  type SavedPlan,
} from "@/lib/workspace";

interface Props {
  /** 지금 화면에 있는 작업 전체 */
  snapshot: PlanSnapshot;
  onLoad: (snapshot: PlanSnapshot) => void;
}

interface Notice {
  kind: "ok" | "error";
  text: string;
}

const buttonClass =
  "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";

function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function download(plan: SavedPlan) {
  const url = URL.createObjectURL(new Blob([serializePlanFile(plan)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileNameFor(plan.name);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SavedPlansMenu({ snapshot, onLoad }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { plans, save, remove } = useSavedPlans();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  /** 마지막으로 저장하거나 불러온 시점의 작업 지문. 이후 바뀌었으면 "저장 안 된 변경"으로 본다. */
  const [baseline, setBaseline] = useState<string | null>(null);
  /** 불러온 직후 화면 상태가 반영되면 그 시점을 기준선으로 삼는다 */
  const syncBaselineRef = useRef(false);
  /** 불러오기·삭제 확인을 기다리는 항목 */
  const [pending, setPending] = useState<{ id: string; action: "load" | "delete" } | null>(null);

  const currentKey = useMemo(() => JSON.stringify(snapshot), [snapshot]);
  const hasWork = snapshot.days.length > 0;
  const dirty = hasWork && currentKey !== baseline;

  useEffect(() => {
    if (!syncBaselineRef.current) return;
    syncBaselineRef.current = false;
    setBaseline(currentKey);
  }, [currentKey]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const openDialog = () => {
    setName((prev) => prev || suggestPlanName(snapshot.input, snapshot.meta));
    setNotice(null);
    setPending(null);
    setOpen(true);
  };

  const trimmed = name.trim();
  const sameName = plans.find((p) => p.name === trimmed);

  const handleSave = () => {
    if (!trimmed) return;
    const result = save({ id: sameName?.id ?? newPlanId(), name: trimmed, snapshot });
    if (!result.ok) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    setBaseline(currentKey);
    setNotice({ kind: "ok", text: sameName ? `"${trimmed}"에 덮어썼습니다.` : `"${trimmed}"로 저장했습니다.` });
  };

  const handleExportCurrent = () => {
    download({ id: newPlanId(), name: trimmed || suggestPlanName(snapshot.input, snapshot.meta), savedAt: new Date().toISOString(), snapshot });
  };

  const handleLoad = (plan: SavedPlan) => {
    onLoad(plan.snapshot);
    syncBaselineRef.current = true;
    setName(plan.name);
    setPending(null);
    setNotice(null);
    setOpen(false);
  };

  const handleDelete = (plan: SavedPlan) => {
    remove(plan.id);
    setPending(null);
    setNotice({ kind: "ok", text: `"${plan.name}"을(를) 삭제했습니다.` });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setNotice({ kind: "error", text: "파일이 너무 큽니다 (5MB 이하만 가져올 수 있어요)." });
      return;
    }
    const parsed = parsePlanFile(await file.text());
    if ("error" in parsed) {
      setNotice({ kind: "error", text: parsed.error });
      return;
    }
    // 같은 id가 이미 있으면 덮어쓰지 않고 새 항목으로 들여온다
    const result = save({ id: newPlanId(), name: parsed.plan.name, snapshot: parsed.plan.snapshot });
    setNotice(
      result.ok
        ? { kind: "ok", text: `"${parsed.plan.name}"을(를) 가져왔습니다. 아래 목록에서 불러오기를 눌러 여세요.` }
        : { kind: "error", text: result.error },
    );
  };

  return (
    <>
      <button type="button" onClick={openDialog} className={buttonClass} aria-haspopup="dialog">
        <FolderOpen className="h-3.5 w-3.5" aria-hidden />
        <span>저장·불러오기</span>
        {plans.length > 0 && <span className="rounded-full bg-indigo-50 px-1.5 text-[10px] font-semibold text-indigo-700">{plans.length}</span>}
        {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="저장하지 않은 변경이 있습니다" aria-label="저장하지 않은 변경 있음" />}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="saved-plans-title"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false); // 바깥(배경)을 누르면 닫는다
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 id="saved-plans-title" className="text-sm font-semibold text-slate-900">
              일정 저장·불러오기
            </h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="space-y-4 overflow-y-auto p-4">
            <section aria-label="현재 작업 저장" className="space-y-2">
              <label htmlFor="plan-name" className="block text-xs font-semibold text-slate-700">
                지금 작업 저장
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="plan-name"
                  value={name}
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 파타야 1박 2일 · 6명"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!trimmed}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden />
                  {sameName ? "덮어쓰기" : "저장"}
                </button>
              </div>
              <p className="text-[11px] leading-4 text-slate-500">
                입력값, 일정, 오후 코스 선택, 선택 옵션, 세일즈 포인트가 함께 저장됩니다.
                {!hasWork && " 아직 생성된 일정이 없어 입력값만 저장됩니다."}
                {sameName && " 같은 이름이 있어 그 저장본을 덮어씁니다."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleExportCurrent} className={buttonClass}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  파일로 내려받기
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} className={buttonClass}>
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  파일에서 가져오기
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  aria-label="일정 파일 선택"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ""; // 같은 파일을 다시 골라도 동작하게 한다
                    void handleFile(file);
                  }}
                />
              </div>
            </section>

            {notice && (
              <p
                role={notice.kind === "error" ? "alert" : "status"}
                className={`flex items-start gap-1.5 rounded-md px-2.5 py-2 text-[11px] leading-4 ${
                  notice.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {notice.kind === "error" ? <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> : <Check className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />}
                {notice.text}
              </p>
            )}

            <section aria-label="저장된 일정" className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700">저장된 일정 ({plans.length})</h3>
              {plans.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-xs text-slate-500">
                  저장된 일정이 없습니다. 위에서 이름을 정해 저장하세요.
                </p>
              ) : (
                <ul className="space-y-2">
                  {plans.map((plan) => {
                    const confirming = pending?.id === plan.id ? pending.action : null;
                    return (
                      <li key={plan.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{plan.name}</p>
                            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{planSummary(plan)}</p>
                            <p className="text-[11px] text-slate-400">저장 {formatSavedAt(plan.savedAt)}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button type="button" onClick={() => download(plan)} aria-label={`${plan.name} 파일로 내려받기`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                              <Download className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPending({ id: plan.id, action: "delete" })}
                              aria-label={`${plan.name} 삭제`}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </div>

                        {confirming === null && (
                          <button
                            type="button"
                            onClick={() => (dirty ? setPending({ id: plan.id, action: "load" }) : handleLoad(plan))}
                            className="mt-2 inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                          >
                            <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                            불러오기
                          </button>
                        )}
                        {confirming === "load" && (
                          <div className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
                            저장하지 않은 변경이 있습니다. 불러오면 지금 화면의 일정과 입력값이 바뀝니다.
                            <span className="mt-1.5 flex gap-2">
                              <button type="button" onClick={() => handleLoad(plan)} className="rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700">
                                그래도 불러오기
                              </button>
                              <button type="button" onClick={() => setPending(null)} className="rounded-md border border-amber-300 bg-white px-2 py-1 font-medium text-amber-800">
                                취소
                              </button>
                            </span>
                          </div>
                        )}
                        {confirming === "delete" && (
                          <div className="mt-2 rounded-md bg-red-50 px-2.5 py-2 text-[11px] leading-4 text-red-700">
                            &quot;{plan.name}&quot;을(를) 삭제할까요? 되돌릴 수 없습니다.
                            <span className="mt-1.5 flex gap-2">
                              <button type="button" onClick={() => handleDelete(plan)} className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700">
                                삭제
                              </button>
                              <button type="button" onClick={() => setPending(null)} className="rounded-md border border-red-200 bg-white px-2 py-1 font-medium text-red-700">
                                취소
                              </button>
                            </span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <p className="text-[11px] leading-4 text-slate-400">
              저장본은 이 브라우저에만 보관됩니다. 브라우저 데이터를 지우거나 다른 기기에서 쓰려면 &quot;파일로 내려받기&quot;로 백업하세요.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
