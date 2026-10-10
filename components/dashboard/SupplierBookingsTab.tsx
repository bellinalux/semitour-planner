"use client";

import { CopyButton } from "@/components/dashboard/CopyButton";
import type { PmChoice } from "@/lib/itinerary";
import type { OpsData } from "@/lib/opsStore";
import {
  BOOKING_STATE_LABEL,
  bookingSummary,
  daysToDeparture,
  emptyBooking,
  requestText,
  serviceKindLabel,
  serviceLines,
  type BookingState,
  type SupplierBooking,
} from "@/lib/supplierBookings";
import type { DayPlan, TripInput } from "@/types";

interface Props {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  ops: OpsData;
  onChange: (next: OpsData) => void;
  title: string;
  companyName: string;
}

const TONE: Record<BookingState, string> = {
  todo: "text-slate-500",
  requested: "text-amber-700",
  confirmed: "text-emerald-700",
  cancelled: "text-slate-400 line-through",
};
const field = "rounded border border-slate-200 bg-white px-1.5 py-0.5";

/** 업체 수배·확정 — 호텔·차량·가이드·식당·선택관광마다 업체·상태·확정 번호, 업체별 요청 문구, 출발 14일 안 미확정 경고 */
export function SupplierBookingsTab({ input, days, pmChoice, ops, onChange, title, companyName }: Props) {
  const lines = serviceLines(input, days, pmChoice);
  const bookings = ops.bookings ?? {};
  const dLeft = daysToDeparture(input);
  const sum = bookingSummary(lines, bookings, dLeft);
  const get = (key: string): SupplierBooking => ({ ...emptyBooking(), ...bookings[key] });
  const set = (key: string, patch: Partial<SupplierBooking>) => {
    const cur = get(key);
    const next = { ...cur, ...patch };
    // 요청함으로 바꾸면 요청일을 남긴다
    if (patch.state === "requested" && !cur.requestedAt) next.requestedAt = new Date().toISOString().slice(0, 10);
    onChange({ ...ops, bookings: { ...bookings, [key]: next } });
  };
  const bySupplier = new Map<string, typeof lines>();
  for (const l of lines) {
    const s = get(l.key).supplier.trim();
    if (!s || get(l.key).state === "cancelled") continue;
    bySupplier.set(s, [...(bySupplier.get(s) ?? []), l]);
  }

  return (
    <div className="space-y-2">
      <p className="text-slate-600">
        확정 {sum.confirmed}/{sum.total}
        {dLeft !== null && ` · 출발 D-${dLeft}`}
      </p>
      {sum.urgent.length > 0 && (
        <p role="alert" className="rounded-md bg-rose-50 px-2.5 py-1.5 text-rose-800">
          출발 14일 안인데 확정되지 않았습니다: {sum.urgent.map((l) => `${serviceKindLabel(l.kind)} ${l.label}`).join(", ")}
        </p>
      )}
      <div className="overflow-x-auto">
        <table aria-label="수배 목록" className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">수배할 것</th>
              <th className="py-1 pr-2 font-medium">업체</th>
              <th className="py-1 pr-2 font-medium">상태</th>
              <th className="py-1 pr-2 font-medium">확정 번호</th>
              <th className="py-1 font-medium">메모</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {lines.map((l) => {
              const b = get(l.key);
              return (
                <tr key={l.key}>
                  <td className="py-1 pr-2">
                    <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">{serviceKindLabel(l.kind)}</span>
                    <b className={TONE[b.state]}>{l.label}</b>
                    <span className="block text-[10.5px] text-slate-400">{l.detail}</span>
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`${l.label} 업체`} defaultValue={b.supplier} onBlur={(e) => e.target.value !== b.supplier && set(l.key, { supplier: e.target.value.slice(0, 60) })} placeholder="랜드사·호텔" className={`${field} w-28`} />
                  </td>
                  <td className="py-1 pr-2">
                    <select aria-label={`${l.label} 상태`} value={b.state} onChange={(e) => set(l.key, { state: e.target.value as BookingState })} className={field}>
                      {(Object.keys(BOOKING_STATE_LABEL) as BookingState[]).map((s) => (
                        <option key={s} value={s}>
                          {BOOKING_STATE_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    {b.requestedAt && <span className="block text-[10.5px] text-slate-400">요청 {b.requestedAt}</span>}
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`${l.label} 확정 번호`} defaultValue={b.confirmNo} onBlur={(e) => e.target.value !== b.confirmNo && set(l.key, { confirmNo: e.target.value.slice(0, 60), ...(e.target.value.trim() && b.state !== "confirmed" ? { state: "confirmed" as const } : {}) })} placeholder="바우처·예약 번호" className={`${field} w-28`} />
                  </td>
                  <td className="py-1">
                    <input aria-label={`${l.label} 메모`} defaultValue={b.note} onBlur={(e) => e.target.value !== b.note && set(l.key, { note: e.target.value.slice(0, 200) })} className={`${field} w-full min-w-24`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bySupplier.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-500">업체별 요청 문구:</span>
          {[...bySupplier.entries()].map(([s, ls]) => (
            <CopyButton key={s} label={`${s} (${ls.length})`} variant="secondary" disabled={false} getText={() => requestText(title, s, ls, companyName)} />
          ))}
        </div>
      )}
      <p className="text-[10.5px] text-slate-400">확정 번호를 적으면 &apos;확정&apos;으로 바뀝니다. 업체 이름을 적으면 그 업체에 보낼 요청 문구를 한 번에 복사할 수 있습니다.</p>
    </div>
  );
}
