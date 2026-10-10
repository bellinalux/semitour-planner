"use client";

import { AlertTriangle, Cloud, Download, HardDrive, History, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useHideCosts, useSession } from "@/components/SessionContext";
import { useBookings } from "@/hooks/useBookings";
import { SalesStatsPanel } from "./SalesStatsPanel";
import type { QuoteLog } from "@/hooks/useQuoteLog";
import type { TeamSyncStatus } from "@/hooks/useTeamSync";
import { backupFileName, collectBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { formatMoney } from "@/lib/currency";

interface Props {
  log: QuoteLog;
  teamSync: TeamSyncStatus;
}

const buttonClass =
  "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 상단 [이력·백업] — 고객에게 나간 견적 이력(누가·언제·얼마), 작성자 이름, 이 브라우저 데이터 백업·복원 */
export function HistoryMenu({ log, teamSync }: Props) {
  const { user } = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<ReturnType<typeof parseBackup> | null>(null);
  const bookings = useBookings(log.author);
  const hideCosts = useHideCosts();

  const open = () => {
    setNotice(null);
    setPendingRestore(null);
    void log.refresh();
    void bookings.refresh();
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  const downloadBackup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(collectBackup())], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName();
    a.click();
    URL.revokeObjectURL(url);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (typeof parsed === "string") setNotice({ kind: "error", text: parsed });
    else setPendingRestore(parsed);
  };

  const confirmRestore = () => {
    if (!pendingRestore || typeof pendingRestore === "string") return;
    const n = restoreBackup(pendingRestore);
    setNotice({ kind: "ok", text: `${n}개 항목을 되살렸습니다. 화면을 다시 불러옵니다.` });
    window.setTimeout(() => window.location.reload(), 800);
  };

  const teamText =
    teamSync === "cloud"
      ? "회사 기본값·원가 기억·견적 이력을 같은 접속 코드를 쓰는 직원과 함께 씁니다(서버 저장)."
      : teamSync === "local"
        ? "서버 저장을 쓸 수 없어 회사 기본값·원가 기억·견적 이력이 이 브라우저에만 저장됩니다. 백업 파일로 옮길 수 있습니다."
        : "서버 저장을 확인하는 중입니다...";

  return (
    <>
      <button type="button" onClick={open} className={buttonClass} aria-haspopup="dialog">
        <History className="h-3.5 w-3.5" aria-hidden />
        <span>이력·백업</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="history-title"
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 id="history-title" className="text-sm font-semibold text-slate-900">
              견적 이력 · 백업
            </h2>
            <button type="button" onClick={close} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="space-y-4 overflow-y-auto p-4">
            <p className="flex items-start gap-1.5 text-[11px] leading-4 text-slate-500">
              {teamSync === "cloud" ? <Cloud className="mt-px h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden /> : <HardDrive className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />}
              {teamText}
            </p>

            {user ? (
              <p className="text-xs text-slate-700">
                작성자: <span className="font-semibold">{user.name}</span> <span className="text-slate-400">(로그인한 계정 이름으로 견적 이력에 남습니다)</span>
              </p>
            ) : (
              <section aria-label="작성자" className="space-y-1">
                <label htmlFor="author-name" className="block text-xs font-semibold text-slate-700">
                  작성자 이름 (견적 이력에 남습니다)
                </label>
                <input
                  id="author-name"
                  value={log.author}
                  maxLength={40}
                  onChange={(e) => log.setAuthor(e.target.value)}
                  placeholder="예: 김세미"
                  className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                />
              </section>
            )}

            <SalesStatsPanel quotes={log.entries} bookings={bookings.list} hideMargin={hideCosts} />

            <section aria-label="견적 이력" className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700">
                고객에게 나간 견적 ({log.entries.length}) · {log.cloud ? "팀 공용" : "이 브라우저"}
              </h3>
              {log.entries.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-xs text-slate-500">
                  아직 기록이 없습니다. 고객용 문서를 인쇄하거나 고객용 문구를 복사하면 여기에 남습니다.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-1.5 pr-2 font-medium">언제</th>
                        <th className="py-1.5 pr-2 font-medium">작성자</th>
                        <th className="py-1.5 pr-2 font-medium">여행</th>
                        <th className="py-1.5 pr-2 text-right font-medium">1인 판매가</th>
                        {!hideCosts && <th className="py-1.5 pr-2 text-right font-medium">마진</th>}
                        <th className="py-1.5 font-medium">문서</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {log.entries.map((e) => (
                        <tr key={e.id}>
                          <td className="py-1.5 pr-2 tabular-nums text-slate-500">{when(e.at)}</td>
                          <td className="py-1.5 pr-2">{e.author}</td>
                          <td className="py-1.5 pr-2">
                            {e.destination} {e.nights}박{e.days}일 · {e.travelers}명{e.departureDate ? ` · ${e.departureDate}` : ""}
                          </td>
                          <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                            {formatMoney(e.pricePerPerson, e.currency)}
                            <span className="block font-normal text-slate-400">{e.channel}</span>
                          </td>
                          {!hideCosts && <td className={`py-1.5 pr-2 text-right tabular-nums ${e.marginRate < 10 ? "text-red-600" : ""}`}>{e.marginRate}%</td>}
                          <td className="py-1.5 text-slate-500">
                            {e.action === "copy" ? "복사: " : ""}
                            {e.document}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-label="백업" className="space-y-2 border-t border-slate-100 pt-3">
              <h3 className="text-xs font-semibold text-slate-700">이 브라우저 데이터 백업</h3>
              <p className="text-[11px] leading-4 text-slate-500">
                입력값, 작업 중인 일정, 이 브라우저에 저장한 일정, 회사 기본값, 원가 기억, 견적 이력을 파일 하나로 내려받습니다. 다른 PC나 브라우저에서 &quot;백업에서 복원&quot;으로 되살릴 수 있습니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={downloadBackup} className={buttonClass}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  백업 내려받기
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} className={buttonClass}>
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  백업에서 복원
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  aria-label="백업 파일 선택"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void pickFile(file);
                  }}
                />
              </div>
              {pendingRestore && typeof pendingRestore !== "string" && (
                <div className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    {pendingRestore.exportedAt ? `${when(pendingRestore.exportedAt)}에 만든 ` : ""}백업({Object.keys(pendingRestore.data).length}개 항목)으로 되살릴까요?
                  </p>
                  <p>지금 이 브라우저의 세미투어 데이터는 백업 내용으로 바뀝니다. 서버에 저장한 일정은 바뀌지 않습니다.</p>
                  <span className="mt-1.5 flex gap-2">
                    <button type="button" onClick={confirmRestore} className="rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700">
                      되살리기
                    </button>
                    <button type="button" onClick={() => setPendingRestore(null)} className="rounded-md border border-amber-300 bg-white px-2 py-1 font-medium">
                      취소
                    </button>
                  </span>
                </div>
              )}
              {notice && (
                <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-md px-2.5 py-2 text-[11px] ${notice.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
                  {notice.text}
                </p>
              )}
            </section>
          </div>
        </div>
      </dialog>
    </>
  );
}
