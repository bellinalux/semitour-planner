"use client";

import { Loader2, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonClass, fieldClass, when } from "./shared";

interface StaffView {
  id: string;
  name: string;
  role: "admin" | "staff" | "sales";
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

async function call<T>(method: string, body?: unknown, query = ""): Promise<T> {
  const res = await fetch(`/api/staff${query}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok) throw new Error(data?.error?.message ?? "처리하지 못했습니다.");
  return data as T;
}

/**
 * 관리자: 직원 계정(추가·권한·접속 막기·코드 변경·삭제)과 관리자 코드 교체 안내.
 * openSignal이 바뀔 때(계정 창을 열 때)마다 목록을 다시 읽는다.
 */
export function StaffManager({ openSignal, isMaster }: { openSignal: number; isMaster: boolean }) {
  const [staff, setStaff] = useState<StaffView[] | null>(null);
  const [workspace, setWorkspace] = useState<{ id: string; pinned: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [draft, setDraft] = useState({ name: "", role: "staff" as StaffView["role"], code: "" });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = async () => {
    const data = await call<{ staff: StaffView[]; workspace?: { id: string; pinned: boolean } | null }>("GET");
    setStaff(data.staff);
    setWorkspace(data.workspace ?? null);
  };

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

  useEffect(() => {
    if (openSignal === 0) return;
    let cancelled = false;
    call<{ staff: StaffView[]; workspace?: { id: string; pinned: boolean } | null }>("GET")
      .then((data) => {
        if (cancelled) return;
        setStaff(data.staff);
        setWorkspace(data.workspace ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setMessage({ kind: "error", text: err instanceof Error ? err.message : "직원 목록을 읽지 못했습니다." });
      });
    return () => {
      cancelled = true;
    };
  }, [openSignal]);

  const patch = (id: string, body: Partial<StaffView> & { code?: string }, ok: string) =>
    run(async () => {
      await call("PATCH", { id, ...body });
      await refresh();
    }, ok);

  return (
    <>
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
              <option value="sales">영업 (원가 숨김)</option>
              <option value="admin">관리자</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] text-slate-500">개인 코드 (6자 이상)</span>
            <input value={draft.code} maxLength={64} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className={`${fieldClass} w-36`} autoComplete="off" />
          </label>
          <button
            type="submit"
            disabled={busy || !draft.name.trim() || draft.code.trim().length < 6}
            className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
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
                    <option value="sales">영업 (원가 숨김)</option>
                    <option value="admin">관리자</option>
                  </select>
                  <span className="text-[11px] text-slate-400">마지막 접속 {when(m.lastLoginAt)}</span>
                  <span className="ml-auto flex gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void patch(m.id, { active: !m.active }, m.active ? "접속을 막았습니다." : "다시 쓸 수 있게 했습니다.")}
                      className={buttonClass}
                    >
                      {m.active ? "접속 막기" : "다시 허용"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setResetFor(resetFor === m.id ? null : m.id)} className={buttonClass}>
                      코드 바꾸기
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(m.id)}
                      aria-label={`${m.name} 삭제`}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                </div>
                {resetFor === m.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="새 개인 코드 (6자 이상)"
                      className={`${fieldClass} w-48`}
                      autoComplete="off"
                    />
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

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`rounded-md px-2.5 py-2 text-[11px] ${message.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}
        >
          {message.text}
        </p>
      )}

      {isMaster && workspace && (
        <section aria-label="관리자 코드 바꾸기" className="space-y-1.5 border-t border-slate-100 pt-3 text-[11px] leading-4 text-slate-600">
          <h3 className="text-xs font-semibold text-slate-700">관리자 코드 바꾸기</h3>
          {workspace.pinned ? (
            <p>
              작업공간이 고정되어 있어, 서버 설정에서 APP_ACCESS_CODE 값만 바꾸면 됩니다. 저장한 일정·예약·직원 계정은 그대로 남고, 모든 사람이 한 번 다시 로그인합니다(직원 개인
              코드는 그대로).
            </p>
          ) : (
            <>
              <p className="font-medium text-amber-700">지금은 저장 데이터의 위치가 관리자 코드에서 만들어집니다. 코드만 바꾸면 저장한 일정·예약·직원 계정이 보이지 않게 됩니다.</p>
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>
                  Cloudflare의 이 Worker 설정(변수)에 <code className="rounded bg-slate-100 px-1">APP_WORKSPACE_ID</code> ={" "}
                  <code className="select-all rounded bg-slate-100 px-1">{workspace.id}</code> 를 먼저 추가합니다.
                </li>
                <li>
                  그다음 <code className="rounded bg-slate-100 px-1">APP_ACCESS_CODE</code> 값을 새 코드로 바꿉니다.
                </li>
                <li>모든 사람이 다시 로그인합니다. 직원 개인 코드는 그대로 쓰고, 상세페이지 스튜디오의 AI 중계 코드는 새 코드로 바꿔 줍니다.</li>
              </ol>
            </>
          )}
        </section>
      )}
    </>
  );
}
