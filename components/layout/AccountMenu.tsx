"use client";

import { LogOut, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import { useSession } from "@/components/SessionContext";
import { AdminReports } from "./account/AdminReports";
import { buttonClass, ROLE_LABEL } from "./account/shared";
import { StaffManager } from "./account/StaffManager";

/** 상단 계정 표시 — 누가 로그인했는지, 로그아웃, (관리자) 직원 계정 관리 */
export function AccountMenu() {
  const session = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 창을 열 때마다 하나씩 올려, 안의 관리자 화면이 목록을 다시 읽게 한다
  const [openSignal, setOpenSignal] = useState(0);

  if (!session.user) return null;
  const { user } = session;
  const canManage = session.isAdmin && session.accounts;

  const open = () => {
    dialogRef.current?.showModal();
    if (canManage) setOpenSignal((n) => n + 1);
  };

  return (
    <>
      <button type="button" onClick={open} className={buttonClass} aria-haspopup="dialog" title="로그인한 계정">
        <UserRound className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">{user.name}</span>
        <span className={`whitespace-nowrap rounded px-1 text-[10px] font-semibold ${user.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
          {ROLE_LABEL[user.role]}
        </span>
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

            {session.isAdmin && !session.accounts && <p className="text-[11px] leading-4 text-amber-700">서버 저장소가 연결되지 않아 직원 계정을 만들 수 없습니다.</p>}

            {canManage && <StaffManager openSignal={openSignal} isMaster={user.isMaster} />}
            {canManage && <AdminReports openSignal={openSignal} />}
          </div>
        </div>
      </dialog>
    </>
  );
}
