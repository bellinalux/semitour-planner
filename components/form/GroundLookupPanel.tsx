"use client";

import { Bus, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { NumberField } from "@/components/ui/NumberField";
import { postJson } from "@/lib/api";
import { recallCosts } from "@/lib/costMemory";
import { formatMoney } from "@/lib/currency";
import { groundPlan, VEHICLE_TIERS, type VehicleTier } from "@/lib/groundPlan";
import type { GroundLookupResponse, RateRange, RateSource } from "@/lib/schemas/groundLookup";
import type { TripInput } from "@/types";

type Level = "low" | "mid" | "high";
const LEVEL_LABEL: Record<Level, string> = { low: "낮음", mid: "보통", high: "높음" };

const SOURCE: Record<RateSource, { text: string; cls: string }> = {
  "book-supplier": { text: "요금표·업체 견적가", cls: "bg-emerald-100 text-emerald-700" },
  "book-web": { text: "요금표·웹 시세", cls: "bg-sky-100 text-sky-700" },
  web: { text: "웹 추정", cls: "bg-amber-100 text-amber-700" },
  none: { text: "못 찾음", cls: "bg-slate-100 text-slate-500" },
};

function SourceChip({ s }: { s: RateSource }) {
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE[s].cls}`}>{SOURCE[s].text}</span>;
}

const pickOf = (r: RateRange, level: Level) => (level === "low" ? r.low : level === "high" ? r.high : r.mid);

/**
 * [전세버스·가이드 조회] — 예상 인원으로 차종·대수·가이드 수를 정하고, 회사 요금표 → 웹 조사 순으로 요금을 찾아
 * 1일 차량비·가이드비를 만든다. 차종별 요금은 인원별 가격표에서 다른 인원으로 바꿔 계산할 때도 쓴다.
 */
export function GroundLookupPanel({ input, onChange }: { input: TripInput; onChange: (patch: Partial<TripInput>) => void }) {
  const [result, setResult] = useState<GroundLookupResponse | null>(null);
  const [state, setState] = useState<{ status: "idle" | "loading" | "error"; message?: string }>({ status: "idle" });
  const [level, setLevel] = useState<Level>("mid");
  const [applied, setApplied] = useState("");
  // 지난 견적 기억(이 브라우저 저장소)은 조회할 때 읽는다 — 화면을 처음 그릴 때 읽으면 서버 화면과 어긋난다
  const [memory, setMemory] = useState<ReturnType<typeof recallCosts>>(null);
  const money = (v: number) => formatMoney(v, input.currency);
  const plan = groundPlan(input.travelers, input.guideCapacity);

  const lookup = async (refresh = false) => {
    if (!input.destination.trim()) {
      setState({ status: "error", message: "여행지를 먼저 입력해 주세요." });
      return;
    }
    setState({ status: "loading" });
    setApplied("");
    setMemory(recallCosts(input.destination, input.currency));
    try {
      const month = /^\d{4}-(\d{2})/.exec(input.departureDate)?.[1];
      const r = await postJson<GroundLookupResponse>("/api/ground-lookup", {
        destination: input.destination.trim(),
        travelers: Math.min(200, Math.max(1, Math.round(input.travelers))),
        currency: input.currency,
        tripScope: input.tripScope,
        month: month ? Number(month) : 0,
        guideCapacity: input.guideCapacity || 45,
        refresh,
      });
      setResult(r);
      setState({ status: "idle" });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "조회하지 못했습니다." });
    }
  };

  // 조회 결과가 지금 인원 기준이 아니면(인원을 바꿨으면) 차종·대수는 지금 인원으로 다시 센다
  const tierRate = result ? result.tiers[plan.tier] : null;
  const vehiclePerDay = tierRate ? pickOf(tierRate, level) * plan.count : 0;
  const guidePerDay = result ? pickOf(result.guide, level) * plan.guides : 0;

  const apply = () => {
    if (!result) return;
    const at = new Date().toISOString();
    const rates = Object.fromEntries(
      (Object.entries(result.tiers) as [VehicleTier, RateRange][]).map(([t, r]) => [t, pickOf(r, level)]).filter(([, v]) => (v as number) > 0),
    ) as TripInput["vehicleTierRates"];
    const vSource = tierRate?.source ?? "none";
    const gSource = result.guide.source;
    const note = (s: RateSource, what: string) => `${what} ${LEVEL_LABEL[level]}${s.startsWith("book") ? " · 회사 요금표" : ""}`;
    const patch: Partial<TripInput> = { vehicleTierRates: rates, costSource: { ...input.costSource }, costStatus: { ...input.costStatus } };
    const done: string[] = [];
    if (vehiclePerDay > 0) {
      patch.vehicleCostPerDay = vehiclePerDay;
      patch.costSource!.vehicle = { kind: "web", at, note: note(vSource, `${plan.tierLabel} ${plan.count}대`) };
      patch.costStatus!.vehicle = vSource === "book-supplier" ? "confirmed" : "estimated";
      done.push(`차량 ${money(vehiclePerDay)}/일`);
    }
    if (guidePerDay > 0) {
      patch.guideCostPerDay = guidePerDay;
      patch.costSource!.guide = { kind: "web", at, note: note(gSource, `가이드 ${plan.guides}명`) };
      patch.costStatus!.guide = gSource === "book-supplier" ? "confirmed" : "estimated";
      done.push(`가이드 ${money(guidePerDay)}/일`);
    }
    onChange(patch);
    setApplied(done.length ? `견적에 적용했습니다 — ${done.join(" · ")}` : "적용할 요금이 없습니다.");
  };

  return (
    <section aria-label="전세버스·가이드 조회" className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-slate-700">
          <span className="font-semibold text-slate-900">{plan.travelers}명</span> → {plan.tierLabel} <span className="font-semibold">{plan.count}대</span> · 가이드{" "}
          <span className="font-semibold">{plan.guides}명</span>
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void lookup(false)}
            disabled={state.status === "loading"}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Bus className="h-3.5 w-3.5" aria-hidden />}
            전세버스·가이드 조회
          </button>
          {result && (
            <button type="button" onClick={() => void lookup(true)} disabled={state.status === "loading"} title="요금표에 값이 있어도 웹에서 새로 찾습니다" className="rounded-md p-1.5 text-slate-500 hover:bg-white">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">웹에서 새로 찾기</span>
            </button>
          )}
        </div>
      </div>

      {state.status === "loading" && <p className="text-slate-500">회사 요금표를 먼저 보고, 없으면 웹에서 찾습니다 (10~40초)…</p>}
      {state.status === "error" && (
        <p role="alert" className="text-rose-700">
          {state.message}
        </p>
      )}
      {memory && (memory.values.vehicleCostPerDay || memory.values.guideCostPerDay) && (
        <p className="text-[11px] text-slate-500">
          지난 견적({memory.savedAt.slice(0, 10)}, {memory.destination}): 차량 {money(memory.values.vehicleCostPerDay ?? 0)}/일 · 가이드 {money(memory.values.guideCostPerDay ?? 0)}/일 — 그때 인원·차종 기준이라 참고만 하세요.
        </p>
      )}

      {result && (
        <div className="space-y-2">
          <table className="w-full text-[11px]">
            <caption className="sr-only">차종별 1대 1일 요금과 가이드 1명 1일 요금</caption>
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-2 font-medium">차종 · 근거</th>
                <th className="py-1 text-right font-medium">1일 보통 (낮음~높음)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ...VEHICLE_TIERS.map((t) => ({ key: t.id, name: t.label, r: result.tiers[t.id], current: t.id === plan.tier, mark: `← ${plan.count}대`, unit: "1대" })),
                { key: "guide", name: result.guide.label, r: result.guide as RateRange, current: true, mark: `← ${plan.guides}명`, unit: "1명" },
              ].map((row) => (
                <tr key={row.key} className={row.current ? "bg-white font-semibold text-indigo-900" : "text-slate-700"} title={row.r.basis}>
                  <td className="py-1 pr-2 align-top">
                    <span className="block">
                      {row.name}
                      {row.current && <span className="ml-1 whitespace-nowrap">{row.mark}</span>}
                    </span>
                    <SourceChip s={row.r.source} />
                  </td>
                  <td className="py-1 text-right align-top tabular-nums">
                    {row.r.mid ? (
                      <>
                        <span className="block">
                          {money(row.r.mid)}
                          <span className="font-normal text-slate-400">/{row.unit}</span>
                        </span>
                        <span className="block text-[10px] font-normal text-slate-500">
                          {money(row.r.low)}~{money(row.r.high)}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(result.vehicleConditions || result.guideConditions) && (
            <p className="text-[11px] text-slate-500">{[result.vehicleConditions && `차량: ${result.vehicleConditions}`, result.guideConditions && `가이드: ${result.guideConditions}`].filter(Boolean).join(" · ")}</p>
          )}
          {!result.searched && result.usedWeb && (
            <p className="text-[11px] text-amber-700">웹 검색 근거를 찾지 못한 항목은 비어 있습니다. 직접 입력하거나 요금표에 업체 요금을 넣어 주세요.</p>
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-2">
            <span className="text-slate-600">기준</span>
            {(["low", "mid", "high"] as Level[]).map((l) => (
              <label key={l} className="inline-flex items-center gap-1">
                <input type="radio" name="ground-level" checked={level === l} onChange={() => setLevel(l)} />
                {LEVEL_LABEL[l]}
              </label>
            ))}
            <span className="w-full tabular-nums text-slate-700">
              차량 {money(vehiclePerDay)}/일 · 가이드 {money(guidePerDay)}/일
            </span>
            <button type="button" onClick={apply} disabled={vehiclePerDay + guidePerDay === 0} className="rounded-md bg-indigo-600 px-2.5 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300">
              견적에 적용
            </button>
          </div>
          {applied && (
            <p role="status" className="text-[11px] text-emerald-700">
              {applied}
            </p>
          )}
          {result.sources.length > 0 && (
            <details className="text-[11px] text-slate-500">
              <summary className="cursor-pointer">웹 출처 {result.sources.length}곳</summary>
              <ul className="mt-1 space-y-0.5">
                {result.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline">
                      {s.title}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-indigo-100 pt-2">
        <NumberField
          id="guideCapacity"
          label="가이드 1명당 최대 인원"
          value={input.guideCapacity || 45}
          suffix="명"
          min={5}
          max={200}
          step={1}
          hint="기본 45명 (버스 1대에 가이드 1명)"
          onChange={(guideCapacity) => onChange({ guideCapacity: Math.max(1, Math.round(guideCapacity || 45)) })}
        />
        <label className="flex items-start gap-2 text-[11px] text-slate-700">
          <input type="checkbox" checked={input.groundScale !== "fixed"} onChange={(e) => onChange({ groundScale: e.target.checked ? "auto" : "fixed" })} className="mt-0.5" />
          <span>
            인원이 바뀌면 차종·대수·가이드 수에 맞춰 차량비·가이드비를 바꿔 계산
            <span className="block text-slate-500">인원별 가격표·최소 출발 인원에 반영됩니다. 끄면 지금 금액을 그대로 씁니다.</span>
          </span>
        </label>
      </div>
    </section>
  );
}
