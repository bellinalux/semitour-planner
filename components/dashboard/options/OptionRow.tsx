import { AlertTriangle, ExternalLink, Trash2, Wand2 } from "lucide-react";
import { CompactNumber } from "@/components/ui/CompactNumber";
import { formatMoney, currencySymbol } from "@/lib/currency";
import { formatDuration } from "@/lib/format";
import { isLossMaking, suggestOptionPrice, type OptionResult } from "@/lib/options";
import type { CurrencyCode, DayPlan, TourOption, TripInput } from "@/types";

interface Props {
  option: TourOption;
  result: OptionResult;
  days: DayPlan[];
  currency: CurrencyCode;
  pricing: Pick<TripInput, "targetMarginRate" | "cardFeeRate" | "currency">;
  onChange: (patch: Partial<TourOption>) => void;
  onDelete: () => void;
}

const selectClass =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

export function OptionRow({ option, result, days, currency, pricing, onChange, onDelete }: Props) {
  const symbol = currencySymbol(currency);
  const suggested = suggestOptionPrice(option.costPerPerson, pricing);
  const loss = isLossMaking(option);

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="옵션 이름"
          value={option.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
        <select
          aria-label={`${option.name} 진행하는 날`}
          value={option.dayNo}
          onChange={(e) => onChange({ dayNo: Number(e.target.value) })}
          className={selectClass}
        >
          <option value={0}>날짜 미지정</option>
          {days.map((d) => (
            <option key={d.day} value={d.day}>
              DAY {d.day}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`${option.name} 삭제`}
          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {option.description && <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{option.description}</p>}
      {(option.durationMinutes > 0 || option.link) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
          {option.durationMinutes > 0 && <span>소요 {formatDuration(option.durationMinutes)}</span>}
          {option.note && <span>{option.note}</span>}
          {option.link && (
            <a href={option.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline">
              예약처 검색
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CompactNumber label="원가 (1인)" value={option.costPerPerson} prefix={symbol} onChange={(costPerPerson) => onChange({ costPerPerson })} />
        <CompactNumber label="옵션 요금 (1인)" value={option.pricePerPerson} prefix={symbol} onChange={(pricePerPerson) => onChange({ pricePerPerson })} />
        <CompactNumber label="최소 인원" value={option.minParticipants} suffix="명" min={1} max={50} onChange={(minParticipants) => onChange({ minParticipants })} />
        <CompactNumber label="예상 참여율" value={option.participationRate} suffix="%" max={100} onChange={(participationRate) => onChange({ participationRate })} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {option.costPerPerson > 0 && option.pricePerPerson !== suggested && (
          <button
            type="button"
            onClick={() => onChange({ pricePerPerson: suggested })}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-600 hover:bg-slate-50"
          >
            <Wand2 className="h-3 w-3" aria-hidden />
            권장 요금 {formatMoney(suggested, currency)} 적용
          </button>
        )}
        {loss && (
          <span className="inline-flex items-center gap-1 font-medium text-red-600">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            옵션 요금이 원가보다 낮아 팔수록 손해입니다
          </span>
        )}
      </div>

      <p className={`mt-2 rounded-md px-2.5 py-1.5 text-[11px] leading-4 ${result.runs ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        {result.runs ? (
          <>
            예상 신청 <span className="font-semibold tabular-nums">{result.participants}명</span> · 이익{" "}
            <span className="font-semibold tabular-nums">{formatMoney(result.profit, currency)}</span>
          </>
        ) : (
          <>
            예상 신청 {result.participants}명 — 최소 인원 {option.minParticipants}명에 못 미쳐 <span className="font-semibold">진행되지 않을 수 있습니다</span>
          </>
        )}
      </p>
    </li>
  );
}
