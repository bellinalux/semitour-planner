"use client";

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import {
  cancelSchedule,
  chargeText,
  dateLabel,
  freeCancelDeadline,
  policyRisks,
  POLICY_PRESETS,
  REASON_LABEL,
  STANDARD_POLICY,
  type CancelPolicy,
  type CancelTier,
  type HighFeeReason,
  type TierKind,
} from "@/lib/cancelPolicy";

const KIND_LABEL: Record<TierKind, string> = {
  refund: "전액 환불",
  deposit: "예약금 환불 불가",
  fixed: "고정 금액 차감(1인)",
  percent: "여행요금 %",
  nonrefundable: "환불 불가(100%)",
};
const field =
  "rounded-md border border-slate-300 px-1.5 py-1 text-[11px] text-slate-900 focus:border-indigo-500 focus:outline-none";
const todayIso = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);

/**
 * 취소 및 환불 규정 편집 — 기본 틀 고르기, 구간 편집, 영업일 기준, 사유·개런티,
 * 출발일이 있으면 실제 날짜·무료 취소 실제 마감·오늘 구간 미리보기와 위험 점검.
 */
export function CancelPolicyEditor({
  value,
  onChange,
  departureDate = "",
  perPerson = 0,
  holidays,
  readOnly = false,
}: {
  value: CancelPolicy;
  onChange: (p: CancelPolicy) => void;
  departureDate?: string;
  perPerson?: number;
  holidays: ReadonlySet<string>;
  /** 보기만 (회사 기본을 상품 화면에서 보여 줄 때) */
  readOnly?: boolean;
}) {
  const custom = value.mode === "custom" && !readOnly;
  const setTier = (i: number, patch: Partial<CancelTier>) =>
    onChange({
      ...value,
      tiers: value.tiers
        .map((t, k) => (k === i ? { ...t, ...patch } : t))
        .sort((a, b) => b.daysBefore - a.daysBefore),
    });
  const rows = cancelSchedule(value, departureDate, todayIso(), holidays);
  const free = freeCancelDeadline(rows);
  const risks = policyRisks(value, { departureDate, perPerson, holidays });

  return (
    <div className="space-y-2 text-[11px] text-slate-700">
      {!readOnly && (
        <label className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">기본 틀</span>
          <select
            aria-label="취소 규정 기본 틀"
            value=""
            onChange={(e) => {
              const p = POLICY_PRESETS.find((x) => x.id === e.target.value);
              if (p)
                onChange({
                  ...p.policy,
                  tiers: p.policy.tiers.map((t) => ({ ...t })),
                });
            }}
            className={field}
          >
            <option value="">— 고르면 아래 구간을 바꿉니다 —</option>
            {POLICY_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-slate-500">
            지금: {custom ? "특별약관" : "표준약관"}
          </span>
        </label>
      )}

      <table className="w-full text-[11px]">
        <caption className="sr-only">취소 구간</caption>
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 pr-1 font-medium">출발 ○일 전부터</th>
            <th className="py-1 pr-1 font-medium">취소료</th>
            <th className="py-1 pr-1 font-medium">
              {departureDate ? "날짜" : ""}
            </th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {value.tiers.map((t, i) => {
            const r = rows[i];
            return (
              <tr
                key={i}
                className={r?.current ? "bg-indigo-50 font-semibold" : ""}
              >
                <td className="py-0.5 pr-1">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    aria-label={`구간 ${i + 1} 출발 며칠 전`}
                    disabled={!custom}
                    value={t.daysBefore}
                    onChange={(e) =>
                      setTier(i, {
                        daysBefore: Math.max(
                          0,
                          Math.min(365, Number(e.target.value) || 0),
                        ),
                      })
                    }
                    className={`${field} w-14 text-right tabular-nums`}
                  />
                </td>
                <td className="py-0.5 pr-1">
                  {custom ? (
                    <span className="flex items-center gap-1">
                      <select
                        aria-label={`구간 ${i + 1} 취소료 종류`}
                        value={t.kind}
                        onChange={(e) =>
                          setTier(i, { kind: e.target.value as TierKind })
                        }
                        className={field}
                      >
                        {(Object.keys(KIND_LABEL) as TierKind[]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      {(t.kind === "percent" || t.kind === "fixed") && (
                        <input
                          type="number"
                          min={0}
                          aria-label={`구간 ${i + 1} ${t.kind === "percent" ? "비율" : "금액"}`}
                          value={t.value}
                          onChange={(e) =>
                            setTier(i, {
                              value: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className={`${field} w-20 text-right tabular-nums`}
                        />
                      )}
                      {t.kind === "percent" && "%"}
                    </span>
                  ) : (
                    chargeText(t)
                  )}
                </td>
                <td className="whitespace-nowrap py-0.5 pr-1 text-slate-500">
                  {r?.to
                    ? r.from
                      ? `${dateLabel(r.from)} ~ ${dateLabel(r.to)}`
                      : `~ ${dateLabel(r.to)}`
                    : ""}
                </td>
                <td className="py-0.5 text-right">
                  {custom && value.tiers.length > 1 && (
                    <button
                      type="button"
                      aria-label={`구간 ${i + 1} 지우기`}
                      onClick={() =>
                        onChange({
                          ...value,
                          tiers: value.tiers.filter((_, k) => k !== i),
                        })
                      }
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {custom ? (
            <>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    tiers: [
                      ...value.tiers,
                      {
                        daysBefore: Math.max(
                          0,
                          (value.tiers[value.tiers.length - 1]?.daysBefore ??
                            10) - 5,
                        ),
                        kind: "percent" as TierKind,
                        value: 30,
                      },
                    ].sort((a, b) => b.daysBefore - a.daysBefore),
                  })
                }
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50"
              >
                <Plus className="h-3 w-3" aria-hidden /> 구간 더하기
              </button>
              <button
                type="button"
                onClick={() => onChange(STANDARD_POLICY)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50"
              >
                표준약관으로 되돌리기
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  mode: "custom",
                  tiers: value.tiers.map((t) => ({ ...t })),
                })
              }
              className="rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50"
            >
              특별약관으로 바꿔 직접 고치기
            </button>
          )}
        </div>
      )}

      {custom && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={value.businessDays}
              onChange={(e) =>
                onChange({ ...value, businessDays: e.target.checked })
              }
            />
            영업일 기준 접수 (월~금
            <input
              aria-label="업무 종료 시각"
              value={value.businessEnd}
              onChange={(e) =>
                onChange({ ...value, businessEnd: e.target.value })
              }
              className={`${field} w-14`}
            />
            까지)
          </label>
          <label className="flex items-center gap-1.5">
            표준보다 높은 사유
            <select
              aria-label="높은 취소료 사유"
              value={value.reason}
              onChange={(e) =>
                onChange({ ...value, reason: e.target.value as HighFeeReason })
              }
              className={field}
            >
              <option value="">없음</option>
              {(Object.keys(REASON_LABEL) as Exclude<HighFeeReason, "">[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {REASON_LABEL[k]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            개런티 예약 취소료 (1인, 원)
            <input
              type="number"
              min={0}
              step={10000}
              value={value.guaranteeFee}
              onChange={(e) =>
                onChange({
                  ...value,
                  guaranteeFee: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className={`${field} w-24 text-right tabular-nums`}
            />
          </label>
          <label className="flex items-center gap-1.5">
            개런티 설명
            <input
              value={value.guaranteeNote}
              placeholder="예) 호텔 확정 객실 취소 불가분"
              onChange={(e) =>
                onChange({ ...value, guaranteeNote: e.target.value })
              }
              className={`${field} min-w-0 flex-1`}
            />
          </label>
        </div>
      )}

      {free && departureDate && (
        <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-emerald-800">
          무료 취소 마감 {dateLabel(free.date)}
          {free.deadline !== free.date && (
            <strong>
              {" "}
              → 영업일 기준 실제 마감 {dateLabel(free.deadline)}{" "}
              {value.businessEnd}
            </strong>
          )}
        </p>
      )}
      {risks.map((r) => (
        <p
          key={r}
          role="alert"
          className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-amber-800"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {r}
        </p>
      ))}
    </div>
  );
}
