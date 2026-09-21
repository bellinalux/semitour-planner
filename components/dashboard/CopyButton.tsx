"use client";

import { Check, ClipboardCopy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";

interface Props {
  label: string;
  variant: "secondary" | "primary";
  disabled: boolean;
  /** 클릭 시점에 텍스트를 만든다 (최신 입력/일정을 반영하기 위해) */
  getText: () => string;
}

type CopyState = "idle" | "copied" | "failed";

const STYLES = {
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  primary: "bg-slate-900 text-white hover:bg-slate-800",
} as const;

export function CopyButton({ label, variant, disabled, getText }: Props) {
  const [state, setState] = useState<CopyState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleClick = async () => {
    const ok = await copyText(getText());
    setState(ok ? "copied" : "failed");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), 2500);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${STYLES[variant]}`}
      >
        {state === "copied" ? (
          <Check className="h-4 w-4 text-emerald-500" aria-hidden />
        ) : (
          <ClipboardCopy className="h-4 w-4" aria-hidden />
        )}
        {state === "copied" ? "복사됨" : label}
      </button>
      <span role="status" aria-live="polite" className="h-3 text-[10px] text-red-600">
        {state === "failed" ? "복사에 실패했습니다. 브라우저 권한을 확인하세요." : ""}
      </span>
    </div>
  );
}
