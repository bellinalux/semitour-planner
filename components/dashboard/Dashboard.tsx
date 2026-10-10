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
import type { SettingsSection } from "@/components/form/settingsFocus";
import { ExportBar } from "./ExportBar";
import { DocumentBar } from "./DocumentBar";
import { ShareLinkBox } from "./ShareLinkBox";
import type { BudgetFitView } from "@/hooks/useBudgetFit";
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
  onChangeDay: (dayNo: number, patch: Partial<DayPlan>) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (day: number) => void;
  onAddTour: (dayNo: number, slot: TourSlot, item: ItineraryItem) => void;
  onMoveItem: (itemId: string, direction: "up" | "down") => void;
  onRelocateItem: (itemId: string, targetDay: number, targetSlot: TourSlot, mode: "move" | "copy") => void;
  onReorderItems: (orderedIds: string[]) => void;
  onInsertItems: (dayNo: number, slot: TourSlot, items: ItineraryItem[]) => void;
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

interface RegionActions {
  /** 지역(도시) 그룹의 첫 날짜 번호 → 다시 만들기 진행 상태 */
  cityRegenState: Record<number, AsyncState>;
  onRegenerateCity: (city: string, dayNumbers: number[]) => void;
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
  regionActions: RegionActions;
  onRetryItinerary: () => void;
  usp: UspView;
  exporter: ExportView;
  feeCheck: FeeCheckView;
  optionSuggest: OptionSuggestView;
  accessibilityCheck: AccessibilityCheckView;
  library: LibraryView;
  documents: React.ComponentProps<typeof DocumentBar>;
  /** 고객용 웹 일정표 링크 */
  share?: React.ComponentProps<typeof ShareLinkBox>;
  /** 견적 화면에서 입력값(할인 시나리오·가격안 등)을 바꾼다 */
  onInputChange: (patch: Partial<TripInput>) => void;
  /** 가격 낮추기에서 일정을 바꿀 때 */
  onReplaceDays?: (days: DayPlan[]) => void;
  /** 견적 경고에서 입력 화면의 해당 폴더로 이동한다 */
  onOpenSettings: (section: SettingsSection) => void;
  /** 견적 경고에서 바로 실행하는 자동 견적 */
  autoQuote: { running: boolean; run: () => void };
  /** 판매가·도매가에서 시작한 견적의 예산 맞추기 */
  budgetFit?: BudgetFitView | null;
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
  regionActions,
  onRetryItinerary,
  usp,
  exporter,
  feeCheck,
  optionSuggest,
  accessibilityCheck,
  library,
  documents,
  share,
  onInputChange,
  onReplaceDays,
  onOpenSettings,
  autoQuote,
  budgetFit,
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
        destination={input.destination}
        travelers={input.travelers}
        engine={{ departureDate: input.departureDate || undefined, onDepartureDate: (departureDate) => onInputChange({ departureDate }) }}
        tripScope={input.tripScope}
        researchInfo={researchInfo}
        pickupNote={input.pickupNote}
        sendingNote={input.sendingNote}
        selectedHotels={input.selectedHotels}
        feeCheck={feeCheck}
        optionSuggest={optionSuggest}
        accessibilityCheck={accessibilityCheck}
        onAddSuggestedOption={optionActions.onAddSuggestedOption}
        pmChoice={pmChoice}
        onSelectPm={onSelectPm}
        onRetry={onRetryItinerary}
        canRegenerateRegion={input.mode === "ai"}
        cityRegenState={regionActions.cityRegenState}
        onRegenerateCity={regionActions.onRegenerateCity}
        {...panelActions}
      />
      {itinerary.status === "success" && days.length > 0 && (
        <TourCatalogPanel
          input={input}
          meta={meta}
          days={days}
          onAddTour={onAddTour}
          onAddOption={optionActions.onAddOption}
          onDeleteItem={itemActions.onDeleteItem}
        />
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
        onInputChange={onInputChange}
        onOpenSettings={onOpenSettings}
        autoQuote={autoQuote}
        budgetFit={budgetFit}
        onReplaceDays={onReplaceDays}
      />
      <UspPanel {...usp} />
      <ExportBar {...exporter} />
      <DocumentBar {...documents} />
      {share && !documents.disabled && <ShareLinkBox {...share} />}
    </div>
  );
}
