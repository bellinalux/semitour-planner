import type {
  AsyncState,
  CourseMeta,
  CurrencyCode,
  DayPlan,
  ItineraryItem,
  PmFreeOption,
  QuoteResult,
  TourSlot,
  TripInput,
  UspItem,
} from "@/types";
import { ExportBar } from "./ExportBar";
import { ItineraryPanel } from "./ItineraryPanel";
import type { ItemPatch } from "./itinerary/TimelineItem";
import { QuotePanel } from "./QuotePanel";
import { TourCatalogPanel } from "./tours/TourCatalogPanel";
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

interface ItemActions {
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (day: number) => void;
  onAddTour: (dayNo: number, slot: TourSlot, item: ItineraryItem) => void;
}

interface Props {
  itinerary: AsyncState;
  days: DayPlan[];
  meta: CourseMeta | null;
  input: TripInput;
  quote: QuoteResult | null;
  pmChoice: Record<number, PmFreeOption["id"]>;
  generatedCurrency: CurrencyCode | null;
  onSelectPm: (day: number, id: PmFreeOption["id"]) => void;
  itemActions: ItemActions;
  onRetryItinerary: () => void;
  usp: UspView;
  exporter: ExportView;
}

export function Dashboard({
  itinerary,
  days,
  meta,
  input,
  quote,
  pmChoice,
  generatedCurrency,
  onSelectPm,
  itemActions,
  onRetryItinerary,
  usp,
  exporter,
}: Props) {
  const { onAddTour, ...panelActions } = itemActions;

  return (
    <div className="space-y-4 p-4">
      <ItineraryPanel
        state={itinerary}
        days={days}
        meta={meta}
        currency={input.currency}
        pmChoice={pmChoice}
        onSelectPm={onSelectPm}
        onRetry={onRetryItinerary}
        {...panelActions}
      />
      {itinerary.status === "success" && days.length > 0 && (
        <TourCatalogPanel input={input} meta={meta} days={days} onAddTour={onAddTour} />
      )}
      <QuotePanel state={itinerary} quote={quote} input={input} days={days} generatedCurrency={generatedCurrency} />
      <UspPanel {...usp} />
      <ExportBar {...exporter} />
    </div>
  );
}
