import { ExternalLink } from "lucide-react";
import { TextField } from "@/components/ui/TextField";
import { currencySymbol } from "@/lib/currency";
import { CostField } from "./CostField";
import { FlightPricePanel } from "./FlightPricePanel";
import { FlightWebSearchPanel } from "./FlightWebSearchPanel";
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
      {input.packageType !== "full" && (
        <p className="text-[11px] leading-4 text-slate-500">
          이 상품은 항공을 팔지 않아(랜드+숙박) 여기서 확인한 항공료는 견적에 더해지지 않습니다. 고객이 직접 예매할 항공권을 참고용으로 조회하거나, 견적서에 별도 안내할 때 쓰세요.
        </p>
      )}
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
      <FlightWebSearchPanel input={input} onChange={onChange} />
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
