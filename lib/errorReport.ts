/**
 * 화면 오류를 서버 오류 기록(/api/errors)으로 보낸다 (세미투어 화면용).
 * 같은 메시지는 한 번만, 한 번 열린 화면에서 최대 20건까지만 보낸다. 페이지 내용은 보내지 않는다.
 */
import { APP_VERSION } from "@/lib/version";

const sent = new Set<string>();
let count = 0;

export function reportError(kind: "error" | "rejection" | "react", err: unknown, where = ""): void {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err ?? "알 수 없는 오류"));
    const message = (e.message || String(err)).slice(0, 500);
    // 확장 프로그램·네트워크 끊김처럼 우리가 고칠 수 없는 오류는 보내지 않는다
    if (!message || /ResizeObserver loop|chrome-extension:|Failed to fetch|NetworkError|Load failed|AbortError/i.test(message + (e.stack ?? ""))) return;
    if (sent.has(message) || count >= 20) return;
    sent.add(message);
    count++;
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        app: "semitour", kind, message,
        stack: (e.stack ?? "").slice(0, 2000),
        where: (where || window.location.pathname).slice(0, 200),
        version: APP_VERSION,
        ua: navigator.userAgent.slice(0, 200),
      }),
    }).catch(() => {});
  } catch {
    /* 오류 보고 자체의 오류는 무시 */
  }
}

/** 전역 오류 듣기 — 화면이 열릴 때 한 번. 해제 함수를 돌려준다 */
export function listenErrors(): () => void {
  const onError = (ev: ErrorEvent) => reportError("error", ev.error ?? ev.message);
  const onRejection = (ev: PromiseRejectionEvent) => reportError("rejection", ev.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
