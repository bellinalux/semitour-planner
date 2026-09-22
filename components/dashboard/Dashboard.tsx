import type {
  AsyncState,
  CourseMeta,
  CurrencyCode,
  DayPlan,
  ItineraryItem,
  OptionSuggestion,
  PmFreeOption,
  QuoteResult,
  SearchSource,
  TourCandidate,
  TourOption,
  TourSlot,
  TripInput,
  UspItem,
} from "@/types";
import type { CourseSegment, SegmentKind } from "@/lib/segmentLibrary";
import { ExportBar } from "./ExportBar";
import { DocumentBar } from "./DocumentBar";
import { ItineraryPanel, type AccessibilityCheckView, type FeeCheckView, type OptionSuggestView } from "./ItineraryPanel";
import { CourseLibraryPanel } from "./library/CourseLibraryPanel";
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
  onMoveItem: (itemId: string, direction: "up" | "down") => void;
  onRelocateItem: (itemId: string, targetDay: number, targetSlot: TourSlot, mode: "move" | "copy") => void;
  onSaveSegment: (items: ItineraryItem[], kind: SegmentKind, defaultName: string) => void;
}

interface LibraryView {
  segments: CourseSegment[];
  onInsert: (dayNo: number, slot: TourSlot, items: ItineraryItem[]) => void;
  onAppendDay: (items: ItineraryItem[], theme: string) => void;
  onDelete: (id: string) => void;
}

interface OptionActions {
  onAddOption: (tour: TourCandidate, dayNo: number) => void;
  onAddSuggestedOption: (suggestion: OptionSuggestion, dayNo: number) => void;
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
  researchInfo: { sources: SearchSource[]; researched: boolean };
  onSelectPm: (day: number, id: PmFreeOption["id"]) => void;
  itemActions: ItemActions;
  optionActions: OptionActions;
  onRetryItinerary: () => void;
  usp: UspView;
  exporter: ExportView;
  feeCheck: FeeCheckView;
  optionSuggest: OptionSuggestView;
  accessibilityCheck: AccessibilityCheckView;
  library: LibraryView;
  documents: React.ComponentProps<typeof DocumentBar>;
}

export function Dashboard({
  itinerary,
  days,
  meta,
  input,
  quote,
  pmChoice,
  generatedCurrency,
  researchInfo,
  onSelectPm,
  itemActions,
  optionActions,
  onRetryItinerary,
  usp,
  exporter,
  feeCheck,
  optionSuggest,
  accessibilityCheck,
  library,
  documents,
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
        travelType={input.mode === "paste" ? "semi" : input.travelType}
        researchInfo={researchInfo}
        pickupNote={input.pickupNote}
        sendingNote={input.sendingNote}
        feeCheck={feeCheck}
        optionSuggest={optionSuggest}
        accessibilityCheck={accessibilityCheck}
        onAddSuggestedOption={optionActions.onAddSuggestedOption}
        pmChoice={pmChoice}
        onSelectPm={onSelectPm}
        onRetry={onRetryItinerary}
        {...panelActions}
      />
      {itinerary.status === "success" && days.length > 0 && (
        <TourCatalogPanel input={input} meta={meta} days={days} onAddTour={onAddTour} onAddOption={optionActions.onAddOption} />
      )}
      {itinerary.status === "success" && days.length > 0 && (
        <CourseLibraryPanel destination={input.destination} days={days} segments={library.segments} onInsert={library.onInsert} onAppendDay={library.onAppendDay} onDelete={library.onDelete} />
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
      <QuotePanel
        state={itinerary}
        quote={quote}
        input={input}
        days={days}
        pmChoice={pmChoice}
        meta={meta}
        generatedCurrency={generatedCurrency}
      />
      <UspPanel {...usp} />
      <ExportBar {...exporter} />
      <DocumentBar {...documents} />
    </div>
  );
}
