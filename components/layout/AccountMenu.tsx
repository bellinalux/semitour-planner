"use client";

import { Loader2, LogOut, Trash2, UserRound, Users, X } from "lucide-react";
import { useRef, useState } from "react";
import { useSession } from "@/components/SessionContext";

interface FeedbackView {
  id: string;
  at: string;
  author: string;
  text: string;
  where: string;
}

interface StaffView {
  id: string;
  name: string;
  role: "admin" | "staff";
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

const ROLE_LABEL = { admin: "관리자", staff: "직원" } as const;
const buttonClass =
  "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
const fieldClass =
  "rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

async function call<T>(method: string, body?: unknown, query = ""): Promise<T> {
  const res = await fetch(`/api/staff${query}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok) throw new Error(data?.error?.message ?? "처리하지 못했습니다.");
  return data as T;
}

function when(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 상단 계정 표시 — 누가 로그인했는지, 로그아웃, (관리자) 직원 계정 관리 */
export function AccountMenu() {
  const session = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [staff, setStaff] = useState<StaffView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [draft, setDraft] = useState({ name: "", role: "staff" as StaffView["role"], code: "" });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackView[] | null>(null);

  if (!session.user) return null;
  const { user } = session;
  const canManage = session.isAdmin && session.accounts;

  const run = async (task: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      if (ok) setMessage({ kind: "ok", text: ok });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "처리하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => setStaff((await call<{ staff: StaffView[] }>("GET")).staff);

  const open = () => {
    setMessage(null);
    dialogRef.current?.showModal();
    if (canManage) {
      void run(refresh);
      void fetch("/api/feedback")
        .then((res) => (res.ok ? (res.json() as Promise<{ feedback: FeedbackView[] }>) : { feedback: [] }))
        .then((data) => setFeedback(data.feedback))
        .catch(() => setFeedback([]));
    }
  };

  const patch = (id: string, body: Partial<StaffView> & { code?: string }, ok: string) =>
    run(async () => {
      await call("PATCH", { id, ...body });
      await refresh();
    }, ok);

  return (
    <>
      <button type="button" onClick={open} className={buttonClass} aria-haspopup="dialog" title="로그인한 계정">
        <UserRound className="h-3.5 w-3.5" aria-hidden />
        <span>{user.name}</span>
        <span className={`rounded px-1 text-[10px] font-semibold ${user.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>{ROLE_LABEL[user.role]}</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="account-title"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 id="account-title" className="text-sm font-semibold text-slate-900">
              계정 · 직원 관리
            </h2>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="space-y-4 overflow-y-auto p-4 text-xs">
            <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
              <p className="text-slate-700">
                <span className="font-semibold text-slate-900">{user.name}</span> ({ROLE_LABEL[user.role]}
                {user.isMaster ? " · 공용 관리자 코드" : " · 개인 코드"})로 들어와 있습니다. 견적 이력에 이 이름이 남습니다.
              </p>
              <button type="button" onClick={() => void session.logout()} className={buttonClass}>
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                로그아웃
              </button>
            </section>

            {user.role === "staff" && (
              <p className="text-[11px] leading-4 text-slate-500">직원 권한은 견적 작성·저장·문서 인쇄를 할 수 있고, 회사 정보·회사 기본값·직원 계정은 관리자만 바꿉니다.</p>
            )}

            {session.isAdmin && !session.accounts && (
              <p className="text-[11px] leading-4 text-amber-700">서버 저장소가 연결되지 않아 직원 계정을 만들 수 없습니다.</p>
            )}

            {canManage && (
              <section aria-label="직원 계정" className="space-y-3">
                <h3 className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  직원 계정 {staff ? `(${staff.length})` : ""}
                </h3>
                <p className="text-[11px] leading-4 text-slate-500">
                  직원마다 개인 코드를 만들어 주면 누가 어떤 견적을 냈는지 이력에 남고, 퇴사자는 그 사람 코드만 끄면 됩니다. 공용 관리자 코드는 관리자만 아는 것이 좋습니다.
                </p>

                <form
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await call("POST", draft);
                      setDraft({ name: "", role: "staff", code: "" });
                      await refresh();
                    }, `${draft.name.trim()} 계정을 만들었습니다. 개인 코드를 본인에게 전해 주세요.`);
                  }}
                >
                  <label className="grid gap-1">
                    <span className="text-[11px] text-slate-500">이름</span>
                    <input value={draft.name} maxLength={30} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${fieldClass} w-28`} placeholder="김세미" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11px] text-slate-500">권한</span>
                    <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as StaffView["role"] })} className={fieldClass}>
                      <option value="staff">직원</option>
                      <option value="admin">관리자</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11px] text-slate-500">개인 코드 (6자 이상)</span>
                    <input value={draft.code} maxLength={64} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className={`${fieldClass} w-36`} autoComplete="off" />
                  </label>
                  <button type="submit" disabled={busy || !draft.name.trim() || draft.code.trim().length < 6} className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300">
                    추가
                  </button>
                </form>

                {staff === null ? (
                  <p className="flex items-center gap-1 text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    불러오는 중...
                  </p>
                ) : staff.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-slate-500">아직 직원 계정이 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {staff.map((m) => (
                      <li key={m.id} className={`rounded-lg border p-2.5 ${m.active ? "border-slate-200" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{m.name}</span>
                          <select
                            aria-label={`${m.name} 권한`}
                            value={m.role}
                            disabled={busy}
                            onChange={(e) => void patch(m.id, { role: e.target.value as StaffView["role"] }, "권한을 바꿨습니다.")}
                            className={fieldClass}
                          >
                            <option value="staff">직원</option>
                            <option value="admin">관리자</option>
                          </select>
                          <span className="text-[11px] text-slate-400">마지막 접속 {when(m.lastLoginAt)}</span>
                          <span className="ml-auto flex gap-1.5">
                            <button type="button" disabled={busy} onClick={() => void patch(m.id, { active: !m.active }, m.active ? "접속을 막았습니다." : "다시 쓸 수 있게 했습니다.")} className={buttonClass}>
                              {m.active ? "접속 막기" : "다시 허용"}
                            </button>
                            <button type="button" disabled={busy} onClick={() => setResetFor(resetFor === m.id ? null : m.id)} className={buttonClass}>
                              코드 바꾸기
                            </button>
                            <button type="button" disabled={busy} onClick={() => setConfirmDelete(m.id)} aria-label={`${m.name} 삭제`} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </span>
                        </div>
                        {resetFor === m.id && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <input value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="새 개인 코드 (6자 이상)" className={`${fieldClass} w-48`} autoComplete="off" />
                            <button
                              type="button"
                              disabled={busy || resetCode.trim().length < 6}
                              onClick={() =>
                                void patch(m.id, { code: resetCode }, "개인 코드를 바꿨습니다. 예전 코드로는 들어올 수 없습니다.").then(() => {
                                  setResetFor(null);
                                  setResetCode("");
                                })
                              }
                              className="rounded-md bg-indigo-600 px-2.5 py-1.5 font-semibold text-white disabled:bg-slate-300"
                            >
                              저장
                            </button>
                          </div>
                        )}
                        {confirmDelete === m.id && (
                          <div className="mt-2 rounded-md bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
                            {m.name} 계정을 삭제할까요? 지난 견적 이력의 이름은 그대로 남습니다.
                            <span className="ml-2 inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void run(async () => {
                                    await call("DELETE", undefined, `?id=${encodeURIComponent(m.id)}`);
                                    setConfirmDelete(null);
                                    await refresh();
                                  }, "삭제했습니다.")
                                }
                                className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white"
                              >
                                삭제
                              </button>
                              <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-md border border-red-200 bg-white px-2 py-1">
                                취소
                              </button>
                            </span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {canManage && (
              <section aria-label="직원 의견" className="space-y-2 border-t border-slate-100 pt-3">
                <h3 className="font-semibold text-slate-700">직원 의견 {feedback ? `(${feedback.length})` : ""}</h3>
                {feedback === null ? null : feedback.length === 0 ? (
                  <p className="text-[11px] text-slate-500">아직 받은 의견이 없습니다. 직원은 화면 위 [의견] 버튼으로 남길 수 있습니다.</p>
                ) : (
                  <ul className="max-h-60 space-y-1.5 overflow-y-auto">
                    {feedback.map((f) => (
                      <li key={f.id} className="rounded-md bg-slate-50 px-2.5 py-2">
                        <p className="text-[11px] text-slate-400">
                          {when(f.at)} · {f.author}
                          {f.where ? ` · ${f.where}` : ""}
                        </p>
                        <p className="whitespace-pre-wrap text-slate-700">{f.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {message && (
              <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-md px-2.5 py-2 text-[11px] ${message.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
                {message.text}
              </p>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
