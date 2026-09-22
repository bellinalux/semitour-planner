import type {
  AsyncState,
  CourseMeta,
  CurrencyCode,
  DayPlan,
  ItineraryItem,
  PmFreeOption,
  QuoteResult,
  TourCandidate,
  TourOption,
  TourSlot,
  TripInput,
  UspItem,
} from "@/types";
import { ExportBar } from "./ExportBar";
import { ItineraryPanel, type FeeCheckView } from "./ItineraryPanel";
import type { ItemPatch } from "./itinerary/TimelineItem";
import { QuotePanel } from "./QuotePanel";
import { OptionsPanel } from "./options/OptionsPanel";
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
  getEmojiText: () => string;
}

interface ItemActions {
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (day: number) => void;
  onAddTour: (dayNo: number, slot: TourSlot, item: ItineraryItem) => void;
}

interface OptionActions {
  onAddOption: (tour: TourCandidate, dayNo: number) => void;
  onChangeOptions: (options: TourOption[]) => void;
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
  optionActions: OptionActions;
  onRetryItinerary: () => void;
  usp: UspView;
  exporter: ExportView;
  feeCheck: FeeCheckView;
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
  optionActions,
  onRetryItinerary,
  usp,
  exporter,
  feeCheck,
}: Props) {
  const { onAddTour, ...panelActions } = itemActions;

  return (
    <div className="space-y-4 p-4">
      <ItineraryPanel
        state={itinerary}
        days={days}
        meta={meta}
        currency={input.currency}
        krwRate={input.exchangeRateToKrw}
        feeCheck={feeCheck}
        pmChoice={pmChoice}
        onSelectPm={onSelectPm}
        onRetry={onRetryItinerary}
        {...panelActions}
      />
      {itinerary.status === "success" && days.length > 0 && (
        <TourCatalogPanel input={input} meta={meta} days={days} onAddTour={onAddTour} onAddOption={optionActions.onAddOption} />
      )}
      {itinerary.status === "success" && days.length > 0 && (
        <OptionsPanel
          input={input}
          days={days}
          meta={meta}
          baseProfit={quote?.ok ? quote.scenario.profit : null}
          onChange={optionActions.onChangeOptions}
        />
      )}
      <QuotePanel state={itinerary} quote={quote} input={input} days={days} generatedCurrency={generatedCurrency} />
      <UspPanel {...usp} />
      <ExportBar {...exporter} />
    </div>
  );
}
