"use client";

import { MonitorDown } from "lucide-react";
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * 앱으로 설치 — 브라우저가 설치를 허용하면(크롬·엣지·안드로이드) 더보기에 [앱으로 설치]를 보여 준다.
 * 아이폰(사파리)은 공유 → 홈 화면에 추가로 설치한다.
 */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setDone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (!prompt || done) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await prompt.prompt();
        const r = await prompt.userChoice;
        if (r.outcome === "accepted") setDone(true);
        setPrompt(null);
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <MonitorDown className="h-3.5 w-3.5" aria-hidden />
      앱으로 설치
    </button>
  );
}
