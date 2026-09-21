import { ExternalLink } from "lucide-react";
import { TextField } from "@/components/ui/TextField";
import { currencySymbol } from "@/lib/currency";
import { CostField } from "./CostField";
import { FlightPricePanel } from "./FlightPricePanel";
import type { SectionProps } from "./types";

function flightSearchUrl(origin: string, destination: string): string {
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${origin} to ${destination}`)}`;
}

export function FlightFields({ input, onChange }: SectionProps) {
  const canSearch = input.originCity.trim() !== "" && input.destination.trim() !== "";

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <span className="text-xs font-semibold text-slate-700">
        항공 ({input.originCity.trim() || "출발지"} → {input.destination.trim() || "여행지"} 왕복)
      </span>
      <TextField
        id="flightOrigin"
        label="출발지"
        value={input.originCity}
        placeholder="예) 인천"
        onChange={(originCity) => onChange({ originCity })}
      />
      <CostField
        id="flightPricePerPerson"
        label="왕복 항공료 (1인, 세금 포함)"
        costKey="flight"
        input={input}
        value={input.flightPricePerPerson}
        prefix={currencySymbol(input.currency)}
        hint="단체 항공권은 소매 요금과 다를 수 있습니다. 가능하면 견적받은 요금을 입력하세요."
        onValueChange={(flightPricePerPerson) => onChange({ flightPricePerPerson })}
        onChange={onChange}
      />
      <FlightPricePanel input={input} onChange={onChange} />
      {canSearch && (
        <a
          href={flightSearchUrl(input.originCity.trim(), input.destination.trim())}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
        >
          Google Flights에서 실제 요금 확인
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
    </div>
  );
}
