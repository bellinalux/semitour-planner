"use client";

import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useHideCosts } from "@/components/SessionContext";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { bookingChecklist } from "@/lib/bookingChecklist";
import { formatMoney } from "@/lib/currency";
import type { PmChoice } from "@/lib/itinerary";
import { assignRooms, dueChecklist, roomingTsv, settle, type OpsData, type Participant } from "@/lib/opsStore";
import type { DayPlan, QuoteData, TripInput } from "@/types";

interface Props {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteData;
  ops: OpsData;
  onChange: (next: OpsData) => void;
}

type Tab = "checklist" | "rooming" | "settlement";
const cell = "rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs focus:border-indigo-500 focus:outline-none";

/**
 * 출발 준비 · 명단 · 정산 — 운영 지시서의 예약 확인 체크리스트를 화면에서 체크하고(기한 지남·임박 표시),
 * 참가자 명단으로 룸리스트를 만들고, 행사 뒤 실제 지출을 넣어 견적 대비 실제 손익을 본다. 상품마다 이 브라우저에 저장.
 */
export function OpsPanel({ input, days, pmChoice, quote, ops, onChange }: Props) {
  const [tab, setTab] = useState<Tab>("checklist");
  const hideCosts = useHideCosts();
  const items = bookingChecklist(input, days, pmChoice, quote.travelers);
  const due = dueChecklist(items, ops.checklist);
  const doneCount = items.filter((i) => ops.checklist[i.label]?.done).length;
  const money = (v: number) => formatMoney(Math.round(v), input.currency);

  const summary = `준비 ${doneCount}/${items.length}${due.overdue.length > 0 ? ` · 기한 지남 ${due.overdue.length}` : ""} · 명단 ${ops.participants.length}명`;
  return (
    <SectionCard title="출발 준비 · 명단 · 정산" description="예약 확인 체크·룸리스트·행사 후 실제 손익 (이 상품, 이 브라우저에 저장)" icon={ClipboardCheck} collapsible defaultOpen={false} summary={summary} anchorId="ops-panel">
      <div className="space-y-3 text-xs">
        <div role="tablist" aria-label="출발 준비 화면" className="flex gap-1">
          {(
            [
              ["checklist", `예약 확인 ${doneCount}/${items.length}`],
              ["rooming", `명단·룸리스트 ${ops.participants.length}명`],
              ["settlement", "행사 후 정산"],
            ] as const
          )
            .filter(([id]) => !(hideCosts && id === "settlement"))
            .map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-full px-3 py-1 font-medium ${tab === id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "checklist" && <Checklist items={items} ops={ops} onChange={onChange} overdue={due.overdue.map((i) => i.label)} soon={due.soon.map((i) => i.label)} />}
        {tab === "rooming" && <Rooming ops={ops} onChange={onChange} perRoom={input.guestsPerUnit} />}
        {tab === "settlement" && !hideCosts && <SettlementView quote={quote} ops={ops} onChange={onChange} money={money} />}
      </div>
    </SectionCard>
  );
}

function Checklist({ items, ops, onChange, overdue, soon }: { items: ReturnType<typeof bookingChecklist>; ops: OpsData; onChange: (n: OpsData) => void; overdue: string[]; soon: string[] }) {
  const set = (label: string, patch: Partial<OpsData["checklist"][string]>) => {
    const cur = ops.checklist[label] ?? { done: false, who: "", ref: "" };
    onChange({ ...ops, checklist: { ...ops.checklist, [label]: { ...cur, ...patch } } });
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <caption className="sr-only">예약 확인 체크리스트</caption>
        <tbody className="divide-y divide-slate-100">
          {items.map((it) => {
            const st = ops.checklist[it.label] ?? { done: false, who: "", ref: "" };
            const late = overdue.includes(it.label);
            const near = soon.includes(it.label);
            return (
              <tr key={it.label} className={st.done ? "text-slate-400" : ""}>
                <td className="w-6 py-1">
                  <input type="checkbox" aria-label={it.label} checked={st.done} onChange={(e) => set(it.label, { done: e.target.checked })} />
                </td>
                <td className="py-1 pr-2">
                  <span className="mr-1 text-[10px] text-slate-400">{it.group}</span>
                  <span className={st.done ? "line-through" : ""}>{it.label}</span>
                </td>
                <td className={`py-1 pr-2 tabular-nums ${late ? "font-semibold text-rose-600" : near ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                  {it.due ?? `D-${it.dueDays}`}
                  {late && " 지남"}
                </td>
                <td className="py-1 pr-1">
                  <input aria-label={`${it.label} 담당`} placeholder="담당" value={st.who} onChange={(e) => set(it.label, { who: e.target.value.slice(0, 20) })} className={`${cell} w-20`} />
                </td>
                <td className="py-1">
                  <input aria-label={`${it.label} 확정번호`} placeholder="확정번호·메모" value={st.ref} onChange={(e) => set(it.label, { ref: e.target.value.slice(0, 60) })} className={`${cell} w-32`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.some((i) => !i.due) && <p className="mt-1 text-[11px] text-slate-400">출발일을 넣으면 기한 날짜가 계산됩니다.</p>}
    </div>
  );
}

function Rooming({ ops, onChange, perRoom }: { ops: OpsData; onChange: (n: OpsData) => void; perRoom: number }) {
  const list = ops.participants;
  const setList = (next: Participant[]) => onChange({ ...ops, participants: next });
  const update = (id: string, patch: Partial<Participant>) => setList(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = () => setList([...list, { id: `p-${Date.now().toString(36)}${list.length}`, name: "", kind: "adult", gender: "", note: "", room: 0 }]);
  const rooms = new Set(list.filter((p) => p.room > 0).map((p) => p.room)).size;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <caption className="sr-only">참가자 명단</caption>
          <thead>
            <tr className="text-left text-[11px] text-slate-500">
              <th className="py-1 pr-1 font-medium">객실</th>
              <th className="py-1 pr-1 font-medium">이름 (여권 영문)</th>
              <th className="py-1 pr-1 font-medium">구분</th>
              <th className="py-1 pr-1 font-medium">성별</th>
              <th className="py-1 pr-1 font-medium">특이사항 (식이·알레르기·거동)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => (
              <tr key={p.id}>
                <td className="py-0.5 pr-1">
                  <input type="number" min={0} aria-label={`${i + 1}번 객실`} value={p.room || ""} onChange={(e) => update(p.id, { room: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={`${cell} w-12`} />
                </td>
                <td className="py-0.5 pr-1">
                  <input aria-label={`${i + 1}번 이름`} value={p.name} onChange={(e) => update(p.id, { name: e.target.value.slice(0, 60) })} className={`${cell} w-40`} />
                </td>
                <td className="py-0.5 pr-1">
                  <select aria-label={`${i + 1}번 구분`} value={p.kind} onChange={(e) => update(p.id, { kind: e.target.value as Participant["kind"] })} className={cell}>
                    <option value="adult">성인</option>
                    <option value="child">아동</option>
                    <option value="infant">유아</option>
                  </select>
                </td>
                <td className="py-0.5 pr-1">
                  <select aria-label={`${i + 1}번 성별`} value={p.gender} onChange={(e) => update(p.id, { gender: e.target.value as Participant["gender"] })} className={cell}>
                    <option value="">-</option>
                    <option value="F">여</option>
                    <option value="M">남</option>
                  </select>
                </td>
                <td className="py-0.5 pr-1">
                  <input aria-label={`${i + 1}번 특이사항`} value={p.note} onChange={(e) => update(p.id, { note: e.target.value.slice(0, 80) })} className={`${cell} w-48`} />
                </td>
                <td className="py-0.5">
                  <button type="button" onClick={() => setList(list.filter((x) => x.id !== p.id))} aria-label={`${i + 1}번 빼기`} className="rounded p-1 text-slate-400 hover:text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          참가자 추가
        </button>
        <button type="button" onClick={() => setList(assignRooms(list, perRoom))} disabled={list.length === 0} className="rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50">
          객실 자동 배정 ({Math.max(1, Math.round(perRoom))}인 1실)
        </button>
        <CopyButton label="룸리스트 복사 (엑셀)" variant="secondary" disabled={list.length === 0} getText={() => roomingTsv(list)} />
        {rooms > 0 && <span className="text-slate-500">객실 {rooms}개</span>}
      </div>
      <p className="text-[11px] text-slate-400">여권번호·생년월일 같은 개인 식별 정보는 넣지 마세요 — 호텔·랜드사에는 이름·객실·특이사항만 보냅니다. 같은 성별끼리 배정하고 유아는 바로 앞 보호자 방에 넣습니다.</p>
    </div>
  );
}

function SettlementView({ quote, ops, onChange, money }: { quote: QuoteData; ops: OpsData; onChange: (n: OpsData) => void; money: (v: number) => string }) {
  const s = ops.settlement;
  const lines = [...quote.lines, ...(quote.scenario.cardFee > 0 ? [{ key: "cardFee", label: "카드 수수료", amount: quote.scenario.cardFee }] : [])];
  const r = settle(lines, quote.scenario.totalPrice, quote.scenario.profit, s);
  const setS = (patch: Partial<OpsData["settlement"]>) => onChange({ ...ops, settlement: { ...s, ...patch } });
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <caption className="sr-only">견적 원가와 실제 지출</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
              <th className="py-1 pr-2 font-medium">항목</th>
              <th className="py-1 pr-2 text-right font-medium">견적</th>
              <th className="py-1 pr-2 text-right font-medium">실제 지출</th>
              <th className="py-1 text-right font-medium">차이</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {r.rows.map((row) => (
              <tr key={row.key}>
                <td className="py-1 pr-2">{row.label}</td>
                <td className="py-1 pr-2 text-right text-slate-500">{money(row.quoted)}</td>
                <td className="py-1 pr-2 text-right">
                  <input
                    type="number"
                    min={0}
                    aria-label={`${row.label} 실제 지출`}
                    value={s.actual[row.key] ?? ""}
                    placeholder={String(Math.round(row.quoted))}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0);
                      const actual = { ...s.actual };
                      if (v === undefined) delete actual[row.key];
                      else actual[row.key] = v;
                      setS({ actual });
                    }}
                    className={`${cell} w-28 text-right`}
                  />
                </td>
                <td className={`py-1 text-right ${row.diff > 0 ? "text-rose-600" : row.diff < 0 ? "text-emerald-700" : "text-slate-400"}`}>{row.diff === 0 ? "—" : `${row.diff > 0 ? "+" : "−"}${money(Math.abs(row.diff))}`}</td>
              </tr>
            ))}
            {s.extras.map((x) => (
              <tr key={x.id}>
                <td className="py-1 pr-2">
                  <input aria-label="추가 지출 항목" value={x.label} onChange={(e) => setS({ extras: s.extras.map((y) => (y.id === x.id ? { ...y, label: e.target.value.slice(0, 40) } : y)) })} className={`${cell} w-40`} />
                </td>
                <td className="py-1 pr-2 text-right text-slate-400">견적 없음</td>
                <td className="py-1 pr-2 text-right">
                  <input type="number" min={0} aria-label={`${x.label || "추가"} 지출`} value={x.amount || ""} onChange={(e) => setS({ extras: s.extras.map((y) => (y.id === x.id ? { ...y, amount: Math.max(0, Number(e.target.value) || 0) } : y)) })} className={`${cell} w-28 text-right`} />
                </td>
                <td className="py-1 text-right">
                  <button type="button" onClick={() => setS({ extras: s.extras.filter((y) => y.id !== x.id) })} aria-label="추가 지출 지우기" className="rounded p-1 text-slate-400 hover:text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setS({ extras: [...s.extras, { id: `x-${Date.now().toString(36)}`, label: "", amount: 0 }] })} className="inline-flex items-center gap-1 font-semibold text-indigo-700">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          견적에 없던 지출 추가
        </button>
        <label className="inline-flex items-center gap-1">
          실제 판매 금액
          <input type="number" min={0} aria-label="실제 판매 금액" value={s.revenue || ""} placeholder={String(Math.round(quote.scenario.totalPrice))} onChange={(e) => setS({ revenue: Math.max(0, Number(e.target.value) || 0) })} className={`${cell} w-32 text-right`} />
        </label>
      </div>
      <div role="group" aria-label="실제 손익" className="grid gap-2 sm:grid-cols-4">
        {[
          { k: "판매 금액", v: money(r.revenue) },
          { k: "실제 원가", v: `${money(r.actualCost)}`, sub: r.actualCost !== r.quotedCost ? `견적 ${money(r.quotedCost)}` : "" },
          { k: "실제 이익", v: money(r.profit), sub: `견적 이익 ${money(r.quotedProfit)}`, tone: r.profit < r.quotedProfit ? "text-rose-700" : "text-emerald-700" },
          { k: "실제 마진율", v: r.marginRate === null ? "—" : `${r.marginRate}%`, sub: `견적 ${quote.scenario.actualMarginRate.toFixed(1)}%` },
        ].map((x) => (
          <div key={x.k} className="rounded-md bg-slate-50 px-2.5 py-2 ring-1 ring-slate-200">
            <p className="text-[10px] text-slate-500">{x.k}</p>
            <p className={`font-semibold tabular-nums ${x.tone ?? "text-slate-900"}`}>{x.v}</p>
            {x.sub && <p className="text-[10px] text-slate-400">{x.sub}</p>}
          </div>
        ))}
      </div>
      <textarea aria-label="정산 메모" value={s.memo} onChange={(e) => setS({ memo: e.target.value.slice(0, 1000) })} rows={2} placeholder="정산 메모 (차이 이유 — 다음 견적에 반영할 것)" className={`${cell} w-full`} />
    </div>
  );
}
