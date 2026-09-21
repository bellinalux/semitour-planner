"use client";

import { Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { inputClass } from "@/components/ui/Field";

type GateState = "checking" | "open" | "locked";

interface AuthStatus {
  required: boolean;
  authed: boolean;
}

/**
 * 접근 코드가 설정된 배포에서 코드를 입력해야 화면을 볼 수 있게 한다.
 * 서버가 잠금을 쓰지 않으면(코드 미설정) 그대로 통과한다.
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth")
      .then((res) => res.json() as Promise<AuthStatus>)
      .then((status) => {
        if (!cancelled) setState(!status.required || status.authed ? "open" : "locked");
      })
      // 상태를 확인하지 못하면 화면은 열어 두고, 실제 보호는 서버 API가 한다
      .catch(() => {
        if (!cancelled) setState("open");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        setState("open");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "확인하지 못했습니다. 다시 시도해 주세요.");
      }
    } catch {
      setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "open") return <>{children}</>;

  if (state === "checking") {
    return (
      <div className="flex h-dvh items-center justify-center text-slate-400" aria-busy="true" aria-label="확인 중">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Lock className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">세미투어 플래너</h1>
            <p className="text-[11px] text-slate-500">접근 코드를 입력해 주세요</p>
          </div>
        </div>

        <label htmlFor="accessCode" className="mt-5 block text-xs font-medium text-slate-700">
          접근 코드
        </label>
        <input
          id="accessCode"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={`${inputClass} mt-1.5`}
          autoFocus
        />
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={code.trim() === "" || submitting}
          className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? "확인 중..." : "입장"}
        </button>
      </form>
    </div>
  );
}
