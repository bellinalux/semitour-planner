"use client";

import { AlertTriangle, Bus, Footprints, Info, Link2, Plus, Printer, Save, TrainFront, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useHideCosts } from "@/components/SessionContext";
import { postJson } from "@/lib/api";
import { DayTourPrint } from "./DayTourPrint";
import { DepartureSection } from "./DepartureSection";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { useNumberText } from "@/hooks/useNumberText";
import { fmt } from "@/lib/courseEngine/time";
import { formatMoney } from "@/lib/currency";
import {
  breakEven,
  changeLegMode,
  customerText,
  dayTourCost,
  dayTourShare,
  dayTourTimeline,
  dayTourWarnings,
  legEnds,
  marketPosition,
  normalizeLegs,
  operationText,
  paxTable,
  toTourCandidate,
  travelersForPrice,
  vehicleFor,
  type DayTourCostInput,
  type DayTourSettings,
} from "@/lib/dayTour";
import { saveCompanyDefaults } from "@/lib/dayTourStore";
import { LEG_MODES, type DayTourLeg, type LegMode } from "@/lib/schemas/dayTour";
import type { TourCandidate } from "@/types";
import type { DayTourWork } from "./DayTourMenu";

interface Props {
  work: DayTourWork;
  onChange: (patch: Partial<DayTourWork>) => void;
  dayCount: number;
  currencyMismatch: boolean;
  onAddOption: (tour: TourCandidate, dayNo: number, price: { cost: number; sale: number }) => void;
  onSave: () => void;
  notice: string;
  /** 고객 웹 일정표·운영표에 넣을 회사 정보 */
  company: { name: string; phone: string; email: string };
}

const MODE_ICON: Record<LegMode, typeof Bus> = { vehicle: Bus, transit: TrainFront, walk: Footprints };
const MODE_LABEL: Record<LegMode, string> = { vehicle: "차량", transit: "대중교통", walk: "도보" };
const BASIS: Record<DayTourLeg["basis"], { text: string; tone: string }> = {
  google: { text: "길찾기", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  searched: { text: "검색", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  estimated: { text: "어림", tone: "bg-amber-50 text-amber-700 ring-amber-200" },
};

/** 표 안의 작은 숫자 입력 */
function Num({ label, value, onChange, suffix, wide }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; wide?: boolean }) {
  const { text, onTextChange, onBlur } = useNumberText(value, onChange);
  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        aria-label={label}
        value={text}
        placeholder="0"
        onChange={(e) => onTextChange(e.target.value)}
        onBlur={onBlur}
        className={`${wide ? "w-24" : "w-16"} rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30`}
      />
      {suffix && <span className="text-slate-400">{suffix}</span>}
    </span>
  );
}

function SettingRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-slate-600">
        {label}
        {hint && <span className="block text-[10px] text-slate-400">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

export function DayTourResult({ work, onChange, dayCount, currencyMismatch, onAddOption, onSave, notice, company }: Props) {
  const { request: req, response: res, stops, legs, settings } = work;
  const [optionDay, setOptionDay] = useState(1);
  const [added, setAdded] = useState("");
  const [printing, setPrinting] = useState(false);
  const hideCosts = useHideCosts();
  const [link, setLink] = useState<{ url: string; error: string }>({ url: "", error: "" });
  const stopPrint = useCallback(() => setPrinting(false), []);
  const money = (v: number) => formatMoney(Math.round(v), req.currency);
  const c: DayTourCostInput = {
    stops,
    legs,
    baseName: req.base,
    start: req.start,
    length: req.length,
    transport: req.transport,
    travelers: req.travelers,
    guide: req.guide,
    currency: req.currency,
    settings,
  };
  const cost = dayTourCost(c);
  const tl = dayTourTimeline(req.base, stops, legs, req.start);
  const warnings = dayTourWarnings(c, res);
  const pax = paxTable(c);
  const even = breakEven(c, cost.salePrice);
  const pos = marketPosition(cost.salePrice, res.market);
  const matchAt = pos.median !== null && cost.salePrice > pos.median ? travelersForPrice(c, pos.median) : null;
  const setS = (patch: Partial<DayTourSettings>) => onChange({ settings: { ...settings, ...patch } });
  const setLeg = (i: number, leg: DayTourLeg) => onChange({ legs: legs.map((l, k) => (k === i ? leg : l)) });
  const usesVehicle = legs.some((l) => l.mode === "vehicle");

  const removeStop = (i: number) => {
    const next = stops.filter((_, k) => k !== i);
    // 빠진 장소 앞뒤 구간을 하나로 (거리는 좌표로 어림)
    const raw: Partial<DayTourLeg>[] = [...legs.slice(0, i), { mode: legs[i].mode }, ...legs.slice(i + 2)];
    onChange({ stops: next, legs: normalizeLegs(raw, next, { name: req.base, lat: res.baseLat, lng: res.baseLng }, req.transport, res.transitBaseFare) });
  };
  const setStop = (i: number, patch: Partial<(typeof stops)[number]>) => onChange({ stops: stops.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  const addOption = () => {
    const tour = toTourCandidate(c, work.title, work.summary, cost);
    onAddOption(tour, optionDay, { cost: Math.round(cost.costPerPerson), sale: cost.salePrice });
    setAdded(`DAY ${optionDay} 선택관광으로 넣었습니다.`);
  };

  return (
    <div className="space-y-3">
      <section aria-label="근교 투어 결과" className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
        <input
          aria-label="투어 상품명"
          value={work.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-900 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
        />
        <textarea
          aria-label="투어 소개"
          value={work.summary}
          onChange={(e) => onChange({ summary: e.target.value })}
          rows={2}
          className="w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-pretty text-slate-600 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
        />
        <div className="grid gap-2 sm:grid-cols-5" role="group" aria-label="핵심 숫자">
          {[
            { k: "1인 원가", v: money(cost.costPerPerson), cost: true },
            { k: "1인 판매가", v: money(cost.salePrice), strong: true },
            { k: "1인 이익", v: `${money(cost.profitPerPerson)} (${settings.marginRate}%)`, cost: true },
            { k: "손익분기", v: even === null ? "—" : `${even}명부터`, cost: true },
            { k: "시장 순위", v: pos.total > 1 ? `${pos.total}개 중 ${pos.rank}위 (싼 순)` : "비교 없음" },
          ]
            .filter((x) => !(hideCosts && "cost" in x && x.cost))
            .map((x) => (
            <div key={x.k} className="rounded-md bg-white px-2.5 py-2 ring-1 ring-slate-200">
              <p className="text-[10px] text-slate-500">{x.k}</p>
              <p className={`tabular-nums ${x.strong ? "text-sm font-bold text-indigo-700" : "font-semibold text-slate-800"}`}>{x.v}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-500">
          {fmt(tl.startMin)} 출발 → {fmt(tl.endMin)} 복귀 ({Math.floor(tl.totalMinutes / 60)}시간 {tl.totalMinutes % 60}분) · {req.travelers}명
          {cost.vehicle && ` · ${cost.vehicle.label}${cost.vehicle.count > 1 ? ` × ${cost.vehicle.count}대` : ""}`}
          {cost.guides > 0 && ` · 가이드 ${cost.guides}명`}
          {(["vehicle", "transit", "walk"] as const)
            .filter((m) => tl.byMode[m].km > 0)
            .map((m) => ` · ${MODE_LABEL[m]} ${tl.byMode[m].km.toFixed(1)}km`)
            .join("")}
        </p>
      </section>

      {warnings.length > 0 && (
        <ul aria-label="확인할 점" className="space-y-1">
          {warnings.map((w, i) => (
            <li key={i} className={`flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-pretty ${w.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>
              {w.tone === "warn" ? <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> : <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />}
              {w.text}
            </li>
          ))}
        </ul>
      )}

      <section aria-label="코스와 이동" className="rounded-lg border border-slate-200 p-3">
        <h3 className="mb-2 flex flex-wrap items-center gap-2 font-semibold text-slate-800">
          코스와 이동
          <span className="font-normal text-slate-400">
            {res.routes.source === "google" ? `거리·시간: 길찾기${res.routes.note ? ` (${res.routes.note})` : ""}` : `거리·시간: 웹 조사·어림${res.routes.note ? ` — ${res.routes.note}` : ""}`}
          </span>
        </h3>
        <ol className="space-y-1">
          {legs.map((leg, i) => {
            const [a, b] = legEnds(req.base, { lat: res.baseLat, lng: res.baseLng }, stops, i);
            const Icon = MODE_ICON[leg.mode];
            const row = tl.rows.find((r) => r.kind === "leg" && r.index === i)!;
            const stop = stops[i];
            const stopRow = tl.rows.find((r) => r.kind === "stop" && r.index === i);
            return (
              <li key={`leg-${i}`} className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-slate-50 px-2 py-1.5 text-slate-600">
                  <Icon className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                  <span className="tabular-nums text-slate-400">{fmt(row.start)}</span>
                  <select
                    aria-label={`구간 ${i + 1} 이동 수단`}
                    value={leg.mode}
                    onChange={(e) => setLeg(i, changeLegMode(leg, e.target.value as LegMode, res.transitBaseFare))}
                    className="rounded border border-slate-200 bg-white px-1 py-0.5"
                  >
                    {LEG_MODES.map((m) => (
                      <option key={m} value={m}>
                        {MODE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                  <span className="min-w-0 truncate">
                    {a.name} → {b.name}
                    {leg.route && <span className="text-slate-400"> · {leg.route}</span>}
                  </span>
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <Num label={`구간 ${i + 1} 거리`} value={leg.km} onChange={(v) => setLeg(i, { ...leg, km: v })} suffix="km" />
                    <Num label={`구간 ${i + 1} 시간`} value={leg.minutes} onChange={(v) => setLeg(i, { ...leg, minutes: Math.round(v) })} suffix="분" />
                    {leg.mode === "vehicle" && <Num label={`구간 ${i + 1} 통행료`} value={leg.toll} onChange={(v) => setLeg(i, { ...leg, toll: v })} suffix="통행료" wide />}
                    {leg.mode === "transit" && <Num label={`구간 ${i + 1} 1인 요금`} value={leg.transitFare} onChange={(v) => setLeg(i, { ...leg, transitFare: v })} suffix="1인" wide />}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${BASIS[leg.basis].tone}`}>{BASIS[leg.basis].text}</span>
                  </span>
                </div>
                {stop && stopRow && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1">
                    <span className="tabular-nums font-semibold text-slate-700">{fmt(stopRow.start)}</span>
                    <span className="min-w-0 flex-1">
                      <b className="text-slate-900">{stop.name}</b>
                      {stop.kind === "meal" && <span className="ml-1 rounded bg-orange-50 px-1 text-[10px] text-orange-700">식사</span>}
                      {stop.kind === "activity" && <span className="ml-1 rounded bg-violet-50 px-1 text-[10px] text-violet-700">체험</span>}
                      <span className="text-slate-400"> {stop.area}</span>
                      {stop.note && <span className="block text-pretty text-[10px] text-slate-400">{stop.note}</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Num label={`${stop.name} 머무는 시간`} value={stop.stayMinutes} onChange={(v) => setStop(i, { stayMinutes: Math.round(v) })} suffix="분" />
                      <Num label={`${stop.name} ${stop.kind === "meal" ? "1인 식대" : "1인 입장료"}`} value={stop.entryFee} onChange={(v) => setStop(i, { entryFee: v })} suffix={stop.kind === "meal" ? "식대" : "입장"} wide />
                      {legs[i].mode === "vehicle" && <Num label={`${stop.name} 주차비`} value={stop.parkingFee} onChange={(v) => setStop(i, { parkingFee: v })} suffix="주차" wide />}
                      {stops.length > 1 && (
                        <button type="button" onClick={() => removeStop(i)} aria-label={`${stop.name} 빼기`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
          <li className="px-2 py-1 text-slate-700">
            <span className="tabular-nums font-semibold">{fmt(tl.endMin)}</span> {req.base} 도착 (해산)
          </li>
        </ol>
      </section>

      {!hideCosts && (
      <div className="grid gap-3 lg:grid-cols-2">
        <section aria-label="원가" className="rounded-lg border border-slate-200 p-3">
          <h3 className="mb-2 font-semibold text-slate-800">원가 ({req.travelers}명 기준)</h3>
          <table className="w-full">
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {cost.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-1 pr-2">
                    {l.label}
                    <span className="block text-pretty text-[10px] text-slate-400">{l.note}</span>
                  </td>
                  <td className="py-1 text-right">
                    {money(l.amount)}
                    <span className="block text-[10px] text-slate-400">{l.per === "person" ? "1인" : `일행 전체 · 1인 ${money(l.amount / req.travelers)}`}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t border-slate-300 font-semibold">
                <td className="py-1">총 원가</td>
                <td className="py-1 text-right">{money(cost.totalCost)}</td>
              </tr>
            </tfoot>
          </table>
          {cost.vehicleCompare && (
            <p className="mt-2 text-slate-500">
              차량 비교: 거리 계산 {money(cost.vehicleCompare.distance)} / 대절 시세 {money(cost.vehicleCompare.charter)}
            </p>
          )}
        </section>

        <section aria-label="원가 기준" className="rounded-lg border border-slate-200 p-3">
          <h3 className="mb-1 font-semibold text-slate-800">원가 기준 (고치면 바로 다시 계산)</h3>
          {usesVehicle && (
            <>
              <div role="radiogroup" aria-label="차량 원가 방식" className="mb-1 flex gap-1">
                {(
                  [
                    ["distance", "거리 원가형"],
                    ["charter", "대절 시세형"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={settings.vehicleMethod === id}
                    onClick={() => setS({ vehicleMethod: id })}
                    className={`rounded-full border px-2.5 py-0.5 font-medium ${settings.vehicleMethod === id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {settings.vehicleMethod === "distance" ? (
                <>
                  <SettingRow label="경유 1L" hint={res.fuelNote || undefined}>
                    <Num label="경유 1리터 가격" value={settings.fuelPrice} onChange={(v) => setS({ fuelPrice: v })} wide />
                  </SettingRow>
                  <SettingRow label="연비" hint={`비우면 ${vehicleFor(req.travelers).label} 기본 ${vehicleFor(req.travelers).kmPerL}km/L`}>
                    <Num label="연비" value={settings.kmPerL} onChange={(v) => setS({ kmPerL: v })} suffix="km/L" />
                  </SettingRow>
                  <SettingRow label="공차 거리 (차고지 왕복)">
                    <Num label="공차 거리" value={settings.deadheadKm} onChange={(v) => setS({ deadheadKm: v })} suffix="km" />
                  </SettingRow>
                  <SettingRow label="기사 당일 인건비" hint="반일은 60%">
                    <Num label="기사 당일 인건비" value={settings.driverDay} onChange={(v) => setS({ driverDay: v })} wide />
                  </SettingRow>
                  <SettingRow label="기사 식비">
                    <Num label="기사 식비" value={settings.driverMeal} onChange={(v) => setS({ driverMeal: v })} wide />
                  </SettingRow>
                  <SettingRow label="차량 고정비 1일" hint="감가·보험·정비, 반일은 60%">
                    <Num label="차량 고정비" value={settings.vehicleFixedDay} onChange={(v) => setS({ vehicleFixedDay: v })} wide />
                  </SettingRow>
                </>
              ) : (
                <>
                  <SettingRow label="대절 당일" hint={res.charterIncludes || undefined}>
                    <Num label="대절 당일 요금" value={settings.charterDay} onChange={(v) => setS({ charterDay: v })} wide />
                  </SettingRow>
                  <SettingRow label="대절 반일">
                    <Num label="대절 반일 요금" value={settings.charterHalf} onChange={(v) => setS({ charterHalf: v })} wide />
                  </SettingRow>
                  <div className="flex gap-3 py-1">
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" checked={settings.charterToll} onChange={(e) => setS({ charterToll: e.target.checked })} />
                      통행료 대절 포함
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" checked={settings.charterParking} onChange={(e) => setS({ charterParking: e.target.checked })} />
                      주차비 대절 포함
                    </label>
                  </div>
                </>
              )}
            </>
          )}
          <SettingRow label="초과 1시간 (기사·가이드)" hint={`기준 ${req.length === "full" ? "10" : "5"}시간`}>
            <Num label="초과 1시간 수당" value={settings.overtimePerHour} onChange={(v) => setS({ overtimePerHour: v })} wide />
          </SettingRow>
          {req.guide && (
            <>
              <SettingRow label={req.length === "full" ? "가이드 당일" : "가이드 반일"}>
                {req.length === "full" ? (
                  <Num label="가이드 당일 요금" value={settings.guideDay} onChange={(v) => setS({ guideDay: v })} wide />
                ) : (
                  <Num label="가이드 반일 요금" value={settings.guideHalf} onChange={(v) => setS({ guideHalf: v })} wide />
                )}
              </SettingRow>
              <SettingRow label="가이드 식비">
                <Num label="가이드 식비" value={settings.guideMeal} onChange={(v) => setS({ guideMeal: v })} wide />
              </SettingRow>
            </>
          )}
          <SettingRow label="여행자보험 1인">
            <Num label="여행자보험 1인" value={settings.insurancePerPerson} onChange={(v) => setS({ insurancePerPerson: v })} wide />
          </SettingRow>
          <SettingRow label="마진율">
            <Num label="마진율" value={settings.marginRate} onChange={(v) => setS({ marginRate: Math.min(80, v) })} suffix="%" />
          </SettingRow>
          {res.rateNote && <p className="mt-1 text-pretty text-[10px] text-slate-400">시세 근거: {res.rateNote}</p>}
          {req.currency === "KRW" && (
            <button
              type="button"
              onClick={() => setAdded(saveCompanyDefaults(settings) ? "인건비·고정비·보험·마진율을 회사 기본값으로 저장했습니다." : "저장하지 못했습니다.")}
              className="mt-2 font-semibold text-indigo-700 underline underline-offset-2"
            >
              인건비·고정비·마진율을 회사 기본값으로 저장
            </button>
          )}
        </section>
      </div>
      )}

      <section aria-label="인원별 가격표" className="rounded-lg border border-slate-200 p-3">
        <h3 className="mb-2 font-semibold text-slate-800">인원별 1인 가격 (마진 {settings.marginRate}%)</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-1 pr-2 font-medium">인원</th>
                <th className="py-1 pr-2 font-medium">차량·가이드</th>
                {!hideCosts && <th className="py-1 pr-2 text-right font-medium">1인 원가</th>}
                <th className="py-1 text-right font-medium">1인 판매가</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {pax.map((r) => (
                <tr key={r.travelers} className={r.isCurrent ? "bg-indigo-50/60 font-semibold" : ""}>
                  <td className="py-1 pr-2">
                    {r.travelers}명{r.isCurrent && <span className="ml-1 rounded bg-indigo-600 px-1 text-[10px] text-white">지금</span>}
                  </td>
                  <td className="py-1 pr-2">
                    {[r.vehicle, r.guides > 0 ? `가이드 ${r.guides}` : ""].filter(Boolean).join(" · ") || "—"}
                    {r.step && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">차종·가이드 바뀜</span>}
                  </td>
                  {!hideCosts && <td className="py-1 pr-2 text-right">{money(r.costPerPerson)}</td>}
                  <td className="py-1 text-right">{money(r.salePrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">다른 차종은 지금 차종 값(연비·고정비·대절료)을 차종 비율로 바꿔 계산했습니다. 통행료는 지금 차종 기준입니다.</p>
      </section>

      <DepartureSection c={c} title={work.title} salePrice={cost.salePrice} breakEven={even} departures={work.departures ?? []} minSeats={work.minSeats} maxSeats={work.maxSeats} onChange={onChange} />

      {res.market.length > 0 && (
        <section aria-label="비슷한 판매 투어" className="rounded-lg border border-slate-200 p-3">
          <h3 className="mb-2 font-semibold text-slate-800">
            비슷한 판매 투어 — 우리 {money(cost.salePrice)}
            {pos.median !== null && <span className="font-normal text-slate-500"> (가운데값 {money(pos.median)})</span>}
          </h3>
          <ul className="divide-y divide-slate-100">
            {res.market.map((m) => {
              const mid = (m.priceLow + m.priceHigh) / 2;
              return (
                <li key={m.name} className="flex flex-wrap items-start gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <b className="text-slate-800">{m.name}</b>
                    <span className="block text-pretty text-[10px] text-slate-400">
                      {[m.operator, m.sourceName, m.transport, m.durationMinutes ? `${Math.round(m.durationMinutes / 60)}시간` : "", m.includes].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {m.priceLow === m.priceHigh ? money(m.priceLow) : `${money(m.priceLow)}~${money(m.priceHigh)}`}
                    <span className={`block text-[10px] ${mid < cost.salePrice ? "text-rose-600" : "text-emerald-700"}`}>
                      {mid < cost.salePrice ? `우리보다 ${money(cost.salePrice - mid)} 쌈` : `우리보다 ${money(mid - cost.salePrice)} 비쌈`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {pos.median !== null && cost.salePrice > pos.median && (
            <p className="mt-1 text-pretty text-amber-800">
              시장 가운데값({money(pos.median)})보다 비쌉니다.{" "}
              {matchAt !== null ? `같은 마진으로 ${matchAt}명이 모이면 맞출 수 있습니다.` : "이 코스·마진으로는 인원을 늘려도 맞추기 어렵습니다 — 가이드·차량 원가나 마진을 확인하세요."} 시장에는 여러 팀을 모아 출발하는 합류형 상품이 많아 1인가가 낮게 나옵니다.
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <CopyButton label="운영표 복사" variant="secondary" disabled={false} getText={() => operationText(c, work.title, cost, !hideCosts)} />
        <CopyButton label="고객 안내문 복사" variant="secondary" disabled={false} getText={() => customerText(c, work.title, work.summary, cost)} />
        <button type="button" onClick={() => setPrinting(true)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
          <Printer className="h-3.5 w-3.5" aria-hidden />
          운영표 인쇄
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              // 같은 투어(저장 id)는 같은 링크를 고친다
              const res = await postJson<{ id: string; path: string }>("/api/share", { ...(work.shareId ? { id: work.shareId } : {}), itinerary: dayTourShare(c, work.title, work.summary, cost, company, true) });
              onChange({ shareId: res.id });
              setLink({ url: `${window.location.origin}${res.path}`, error: "" });
            } catch (e) {
              setLink({ url: "", error: e instanceof Error ? e.message : "링크를 만들지 못했습니다." });
            }
          }}
          className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-800 hover:bg-indigo-100"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          {work.shareId ? "고객 링크 고치기" : "고객용 웹 링크"}
        </button>
        <button type="button" onClick={onSave} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
          <Save className="h-3.5 w-3.5" aria-hidden />
          저장
        </button>
        {dayCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <select aria-label="선택관광으로 넣을 날" value={optionDay} onChange={(e) => setOptionDay(Number(e.target.value))} className="rounded border border-slate-300 bg-white px-1.5 py-1">
              {Array.from({ length: dayCount }, (_, k) => k + 1).map((d) => (
                <option key={d} value={d}>
                  DAY {d}
                </option>
              ))}
            </select>
            <button type="button" onClick={addOption} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              패키지 선택관광으로 넣기
            </button>
          </span>
        )}
        {currencyMismatch && <span className="text-[11px] text-slate-500">견적 통화와 달라 선택관광으로 넣을 수 없습니다.</span>}
      </div>
      {link.url && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-emerald-800">
          고객용 링크:
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
            {link.url}
          </a>
          <CopyButton label="링크 복사" variant="secondary" disabled={false} getText={() => link.url} />
        </p>
      )}
      {link.error && <p className="text-red-600">{link.error}</p>}
      {printing && <DayTourPrint c={c} title={work.title} cost={cost} company={company.name} onDone={stopPrint} />}
      {(notice || added) && (
        <p role="status" className="text-emerald-700">
          {notice || added}
        </p>
      )}

      {res.sources.length > 0 && (
        <details className="rounded-md p-2 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-[11px] font-medium text-slate-600">참고한 출처 ({res.sources.length})</summary>
          <ul className="mt-1.5 space-y-0.5">
            {res.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-600 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-pretty text-[10px] text-slate-400">유가·통행료·인건비·입장료는 조사 시점의 참고값입니다. 판매 전에 실제 수배 요금으로 확인하세요. 교통 혼잡은 반영하지 않습니다.</p>
    </div>
  );
}
