import { cachedHolidays } from "@/hooks/useKoreanHolidays";
import { cancelSchedule, dateLabel, freeCancelDeadline, policyDisclosure, type CancelPolicy } from "@/lib/cancelPolicy";
import type { CurrencyCode } from "@/types";

/** 인쇄 문서의 취소 및 환불 규정 표 — 구간·실제 날짜·취소료, 무료 취소 실제 마감, 특별약관 고지 */
export function CancelPolicyTable({ policy, departureDate, currency }: { policy: CancelPolicy; departureDate: string; currency: CurrencyCode }) {
  const rows = cancelSchedule(policy, departureDate, "", cachedHolidays(), currency);
  const free = freeCancelDeadline(rows);
  const hasDates = rows.some((r) => r.to);
  return (
    <div>
      {policyDisclosure(policy).map((line) => (
        <p key={line} className="mb-1 text-slate-600">
          {line}
        </p>
      ))}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-300 bg-slate-50 text-left">
            <th className="px-2 py-1 font-medium">취소 시점</th>
            {hasDates && <th className="px-2 py-1 font-medium">날짜</th>}
            <th className="px-2 py-1 font-medium">취소료</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.range} className="border-b border-slate-200">
              <td className="px-2 py-1">{r.range}</td>
              {hasDates && <td className="px-2 py-1">{r.to ? (r.from ? `${dateLabel(r.from)} ~ ${dateLabel(r.to)}` : `~ ${dateLabel(r.to)}`) : ""}</td>}
              <td className="px-2 py-1">{r.charge}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {free && (
        <p className="mt-1 font-medium text-slate-700">
          무료 취소 마감: {dateLabel(free.date)}
          {free.deadline !== free.date && ` → 영업일 기준 실제 마감 ${dateLabel(free.deadline)} ${policy.businessEnd}`}
        </p>
      )}
    </div>
  );
}
