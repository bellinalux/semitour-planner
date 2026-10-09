"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface TrayTask {
  key: string;
  label: string;
  running: boolean;
  /** 보통 걸리는 시간 안내 (예: "30초~1분") */
  typical: string;
}

/**
 * 웹 작업 진행 표시 — 웹 검색·AI 작업(시세 조회·시간 검증·코스 점검·타업체 찾기 등)이 도는 동안 화면 오른쪽 아래에
 * 무엇이 몇 초째 도는지와 보통 걸리는 시간을 보여 준다. 다 끝나면 잠깐 "끝났습니다"를 띄우고, 다른 탭에 있으면 탭 제목에 ✓를 붙인다.
 */
export function TaskTray({ tasks }: { tasks: TrayTask[] }) {
  const running = tasks.filter((t) => t.running);
  const anyRunning = running.length > 0;
  const runningKey = running.map((t) => t.key).join(",");
  /** 작업별 시작 시각과 지금 시각 (1초마다) */
  const [starts, setStarts] = useState<Record<string, number>>({});
  const [now, setNow] = useState(0);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    const t = Date.now();
    // 새로 시작한 작업의 시작 시각을 적고, 끝난 작업은 지운다
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 도는 작업 목록이 바뀔 때만
    setStarts((s) => Object.fromEntries(runningKey.split(",").filter(Boolean).map((k) => [k, s[k] ?? t])));
    setNow(t);
  }, [runningKey]);
  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  // 다 끝나면 알림 (5초), 다른 탭이면 탭 제목에 ✓
  useEffect(() => {
    if (anyRunning) {
      wasRunning.current = true;
      return;
    }
    if (!wasRunning.current) return;
    wasRunning.current = false;
    setDoneAt(Date.now());
    const base = document.title.replace(/^✓ /, "");
    if (document.hidden) {
      document.title = `✓ ${base}`;
      const restore = () => {
        document.title = base;
        document.removeEventListener("visibilitychange", restore);
      };
      document.addEventListener("visibilitychange", restore);
    }
    const id = window.setTimeout(() => setDoneAt(null), 5000);
    return () => window.clearTimeout(id);
  }, [anyRunning]);

  if (!anyRunning && doneAt === null) return null;
  return (
    <div
      role="status"
      aria-label="웹 작업 진행"
      className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-4 shadow-lg"
    >
      {anyRunning ? (
        <>
          <p className="mb-1 font-semibold text-slate-800">웹 작업 진행 중 — 다른 작업을 해도 됩니다</p>
          <ul className="space-y-1">
            {running.map((t) => {
              const sec = Math.max(0, Math.round((now - (starts[t.key] ?? now)) / 1000));
              return (
                <li key={t.key} className="flex items-start gap-1.5">
                  <Loader2 className="mt-px size-3.5 shrink-0 animate-spin text-indigo-600" aria-hidden />
                  <span className="min-w-0 flex-1 text-pretty text-slate-700">
                    {t.label}
                    <span className="block text-slate-400">
                      {sec}초째 · 보통 {t.typical}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
          <CheckCircle2 className="size-4" aria-hidden />
          웹 작업이 끝났습니다
        </p>
      )}
    </div>
  );
}
