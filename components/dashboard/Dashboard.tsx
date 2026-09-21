import type { AsyncState, CurrencyCode, DayPlan, PmFreeOption } from "@/types";
import { ExportBar } from "./ExportBar";
import { ItineraryPanel } from "./ItineraryPanel";
import { QuotePanel } from "./QuotePanel";
import { UspPanel } from "./UspPanel";

interface Props {
  itinerary: AsyncState;
  days: DayPlan[];
  currency: CurrencyCode;
  pmChoice: Record<number, PmFreeOption["id"]>;
  onSelectPm: (day: number, id: PmFreeOption["id"]) => void;
  usp: AsyncState;
  onRetryItinerary: () => void;
  onRetryUsp: () => void;
}

export function Dashboard({
  itinerary,
  days,
  currency,
  pmChoice,
  onSelectPm,
  usp,
  onRetryItinerary,
  onRetryUsp,
}: Props) {
  return (
    <div className="space-y-4 p-4">
      <ItineraryPanel
        state={itinerary}
        days={days}
        currency={currency}
        pmChoice={pmChoice}
        onSelectPm={onSelectPm}
        onRetry={onRetryItinerary}
      />
      <QuotePanel state={itinerary} />
      <UspPanel state={usp} onRetry={onRetryUsp} />
      <ExportBar disabled={itinerary.status !== "success"} />
    </div>
  );
}
