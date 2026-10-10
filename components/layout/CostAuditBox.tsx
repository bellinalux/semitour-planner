"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { auditPlan, currenciesOf, type AuditFlag, type FxNow } from "@/lib/costAudit";
import type { TripInput } from "@/types";

interface Props {
  /** 점검할 상품 (이름과 입력값을 불러오는 함수) */
  plans: { id: string; name: string }[];
  loadInput: (id: string) => Promise<TripInput | null>;
}

/** 지금 1단위 = 몇 원 */
async function krwPer(code: string): Promise<number | null> {
  if (code === "KRW") return 1;
  try {
    const r = await fetch(`/api/fx?code=${code}`);
    if (!r.ok) return null;
    const v = ((await r.json()) as { krwPerUnit?: number }).krwPerUnit ?? 0;
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * 원가 점검 — 저장한 상품들의 환율 변동·원가 확인일·지난 출발일을 한 번에 본다 (AI를 쓰지 않는다).
 * 손해 볼 수 있는 상품을 위로.
 */
export function CostAuditBox({ plans, loadInput }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; name: string; flags: AuditFlag[] }[] | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const inputs = await Promise.all(plans.slice(0, 40).map(async (p) => ({ ...p, input: await loadInput(p.id) })));
      const codes = [...new Set(inputs.flatMap((x) => (x.input ? currenciesOf(x.input) : [])))];
      const fx: FxNow = Object.fromEntries(await Promise.all(codes.map(async (c) => [c, await krwPer(c)] as const)));
      const rows = inputs
        .filter((x): x is typeof x & { input: TripInput } => x.input !== null)
        .map((x) => ({ id: x.id, name: x.name, flags: auditPlan(x.input, fx) }))
        .sort((a, b) => b.flags.filter((f) => f.tone === "warn").length - a.flags.filter((f) => f.tone === "warn").length);
      setResult(rows);
    } finally {
      setBusy(false);
    }
  };

  const flagged = result?.filter((r) => r.flags.length > 0) ?? [];
  return (
    <section aria-label="원가 점검" className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
        <b className="text-slate-800">저장한 상품 원가 점검</b>
        <button type="button" disabled={busy || plans.length === 0} onClick={() => void run()} className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          점검하기 ({Math.min(plans.length, 40)}개)
        </button>
      </div>
      <p className="text-[11px] text-slate-500">환율 변동(2% 넘게), 원가를 넣은 지 30일 넘은 항목, 지난 출발일을 찾습니다. 손해 볼 수 있는 상품부터 보여 줍니다.</p>
      {result &&
        (flagged.length === 0 ? (
          <p role="status" className="text-emerald-700">
            점검한 {result.length}개 상품 모두 이상 없습니다.
          </p>
        ) : (
          <ul role="status" className="space-y-1.5">
            {flagged.map((r) => (
              <li key={r.id}>
                <b className="text-slate-800">{r.name}</b>
                {r.flags.map((f) => (
                  <span key={f.text} className={`block ${f.tone === "warn" ? "text-amber-800" : "text-slate-600"}`}>
                    · {f.text}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
