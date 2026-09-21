import type { AsyncState, CurrencyCode, DayPlan, PmFreeOption, QuoteResult, TripInput, UspItem } from "@/types";
import { ExportBar } from "./ExportBar";
import { ItineraryPanel } from "./ItineraryPanel";
import type { ItemCostPatch } from "./itinerary/TimelineItem";
import { QuotePanel } from "./QuotePanel";
import { UspPanel } from "./UspPanel";

interface UspView {
  state: AsyncState;
  items: UspItem[];
  isStale: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
}

interface ExportView {
  disabled: boolean;
  getInternalText: () => string;
  getCustomerText: () => string;
}

interface Props {
  itinerary: AsyncState;
  days: DayPlan[];
  input: TripInput;
  quote: QuoteResult | null;
  pmChoice: Record<number, PmFreeOption["id"]>;
  generatedCurrency: CurrencyCode | null;
  onSelectPm: (day: number, id: PmFreeOption["id"]) => void;
  onChangeCost: (itemId: string, patch: ItemCostPatch) => void;
  onRetryItinerary: () => void;
  usp: UspView;
  exporter: ExportView;
}

export function Dashboard({
  itinerary,
  days,
  input,
  quote,
  pmChoice,
  generatedCurrency,
  onSelectPm,
  onChangeCost,
  onRetryItinerary,
  usp,
  exporter,
}: Props) {
  return (
    <div className="space-y-4 p-4">
      <ItineraryPanel
        state={itinerary}
        days={days}
        currency={input.currency}
        pmChoice={pmChoice}
        onSelectPm={onSelectPm}
        onChangeCost={onChangeCost}
        onRetry={onRetryItinerary}
      />
      <QuotePanel state={itinerary} quote={quote} input={input} days={days} generatedCurrency={generatedCurrency} />
      <UspPanel {...usp} />
      <ExportBar {...exporter} />
    </div>
  );
}
