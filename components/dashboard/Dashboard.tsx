import type { AsyncState } from "@/types";
import { ExportBar } from "./ExportBar";
import { ItineraryPanel } from "./ItineraryPanel";
import { QuotePanel } from "./QuotePanel";
import { UspPanel } from "./UspPanel";

interface Props {
  itinerary: AsyncState;
  usp: AsyncState;
  onRetryItinerary: () => void;
  onRetryUsp: () => void;
}

export function Dashboard({ itinerary, usp, onRetryItinerary, onRetryUsp }: Props) {
  return (
    <div className="space-y-4 p-4">
      <ItineraryPanel state={itinerary} onRetry={onRetryItinerary} />
      <QuotePanel state={itinerary} />
      <UspPanel state={usp} onRetry={onRetryUsp} />
      <ExportBar disabled={itinerary.status !== "success"} />
    </div>
  );
}
