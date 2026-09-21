import type { AsyncState, CurrencyCode, DayPlan, PmFreeOption, TripInput } from "@/types";
import { ExportBar } from "./ExportBar";
import { ItineraryPanel } from "./ItineraryPanel";
import type { ItemCostPatch } from "./itinerary/TimelineItem";
import { QuotePanel } from "./QuotePanel";
import { UspPanel } from "./UspPanel";

interface Props {
  itinerary: AsyncState;
  days: DayPlan[];
  input: TripInput;
  pmChoice: Record<number, PmFreeOption["id"]>;
  generatedCurrency: CurrencyCode | null;
  onSelectPm: (day: number, id: PmFreeOption["id"]) => void;
  onChangeCost: (itemId: string, patch: ItemCostPatch) => void;
  usp: AsyncState;
  onRetryItinerary: () => void;
  onRetryUsp: () => void;
}

export function Dashboard({
  itinerary,
  days,
  input,
  pmChoice,
  generatedCurrency,
  onSelectPm,
  onChangeCost,
  usp,
  onRetryItinerary,
  onRetryUsp,
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
      <QuotePanel
        state={itinerary}
        input={input}
        days={days}
        pmChoice={pmChoice}
        generatedCurrency={generatedCurrency}
      />
      <UspPanel state={usp} onRetry={onRetryUsp} />
      <ExportBar disabled={itinerary.status !== "success"} />
    </div>
  );
}
