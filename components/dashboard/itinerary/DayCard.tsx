import { REST_LABEL } from "@/lib/pace";
import { dayMealIssues, fitCourse } from "@/lib/courseFit";
import { ReorderButton } from "./ReorderButton";
import { AlertTriangle, BedDouble, BookmarkPlus, Clock, Compass, Flag, Plus, Sun, Sunset, Timer } from "lucide-react";
import { useContext } from "react";
import { CourseEngineContext } from "@/hooks/useCourseEngine";
import { DayTimeCheckContext } from "@/hooks/useDayTimeCheck";
import { calcDayEnd, calcDayGap, calcDayLoad, computeItemTimings, dayMeetingTime, dayTourStart, hotelLeadMinutes, STANDARD_DAY_END, timelineEndTime, type DayLoadLevel } from "@/lib/dayLoad";
import { formatDuration } from "@/lib/format";
import { dayItems } from "@/lib/itinerary";
import type { SegmentKind } from "@/lib/segmentLibrary";
import type { DayPlan, CurrencyCode, ItineraryItem, OptionSuggestion, PmFreeOption, TourSlot, TripScope } from "@/types";
import { continuousDriving } from "@/lib/driverHours";
import { offRouteMeals } from "@/lib/routeOrder";
import { DayFillPanel } from "./DayFillPanel";
import { DayIssues } from "./DayIssues";
import { MealRoutePanel } from "./MealRoutePanel";
import { PmOptionSwitch } from "./PmOptionSwitch";
import { RouteCheckPanel } from "./RouteCheckPanel";
import { RouteSketch } from "./RouteSketch";
import { SessionBlock } from "./SessionBlock";
import { TimelineItem, type ItemPatch } from "./TimelineItem";

const SCORE_TONE: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  B: "bg-sky-50 text-sky-800 ring-sky-200",
  C: "bg-amber-50 text-amber-800 ring-amber-200",
  D: "bg-rose-50 text-rose-700 ring-rose-200",
};

const LOAD_BADGE_TONE: Record<DayLoadLevel, string> = {
  ok: "bg-white text-slate-600 ring-slate-200",
  tight: "bg-amber-50 text-amber-800 ring-amber-200",
  overloaded: "bg-rose-50 text-rose-700 ring-rose-200",
};

const LOAD_WARNING: Record<Exclude<DayLoadLevel, "ok">, string> = {
  tight: "이동·체류 시간이 빠듯합니다. 코스를 줄이는 것을 검토하세요.",
  overloaded: "이동·체류 시간을 다 더하면 하루에 소화하기 어렵습니다. 코스를 줄이거나 다른 날로 옮기세요.",
};

interface Props {
  plan: DayPlan;
  /** 다른 날로 이동·복사할 때, 새 날짜로 즐겨찾기를 넣을 때 쓰는 전체 일정 */
  days: DayPlan[];
  /** 이 날짜의 숙박 도시에서 선택해 둔 호텔 이름 (없으면 표시하지 않는다) */
  hotelName?: string;
  /** 동선 확인에 쓰는 여행지 (국가·지역) */
  destination: string;
  /** 인원 (동선상 식당을 찾을 때 단체 수용 기준) */
  travelers?: number;
  /** 국내(한국 방문 외국인 대상)/해외 여행. 추천일정 검색 대상 관광객을 정한다 */
  tripScope: TripScope;
  currency: CurrencyCode;
  selectedPmId: PmFreeOption["id"];
  editing: boolean;
  onSelectPm: (id: PmFreeOption["id"]) => void;
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onChangeDay: (dayNo: number, patch: Partial<DayPlan>) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (day: number) => void;
  onAddSuggestedOption: (suggestion: OptionSuggestion, dayNo: number) => void;
  onMoveItem: (itemId: string, direction: "up" | "down") => void;
  onRelocateItem: (itemId: string, targetDay: number, targetSlot: TourSlot, mode: "move" | "copy") => void;
  onSaveSegment: (items: ItineraryItem[], kind: SegmentKind, defaultName: string) => void;
  onReorderItems: (orderedIds: string[]) => void;
  onInsertItems: (dayNo: number, slot: TourSlot, items: ItineraryItem[]) => void;
}

export function DayCard({
  plan,
  days,
  hotelName,
  destination,
  travelers,
  tripScope,
  currency,
  selectedPmId,
  editing,
  onSelectPm,
  onChangeItem,
  onChangeDay,
  onDeleteItem,
  onAddItem,
  onAddSuggestedOption,
  onMoveItem,
  onRelocateItem,
  onSaveSegment,
  onReorderItems,
  onInsertItems,
}: Props) {
  const city = (plan.overnightCity ?? "").trim() || undefined;
  const selected = plan.pmFreeOptions.find((o) => o.id === selectedPmId) ?? plan.pmFreeOptions[0];
  const pmChoiceForDay = { [plan.day]: selectedPmId };
  const load = calcDayLoad(plan, pmChoiceForDay);
  // 하루 일정 시간 검증 (방문 장소가 2곳 이상인 날)
  const dayTime = useContext(DayTimeCheckContext);
  // 코스 엔진 점수 (한 번 점검한 날) — 누르면 점검 상자로
  const engine = useContext(CourseEngineContext);
  const score = engine?.scores[plan.day];
  const rescoring = engine?.byDay[plan.day]?.status === "loading";
  const placeCount = dayItems(plan, pmChoiceForDay).filter((i) => !["flight", "transfer", "hotel", "free_time"].includes(i.type ?? "")).length;
  const meetingTime = dayMeetingTime(plan);
  // 시각은 첫 장소 도착(미팅 + 호텔에서 이동)부터 계산한다
  const tourStart = dayTourStart(plan);
  const lead = hotelLeadMinutes(plan);
  const endTime = load.totalMinutes > 0 ? timelineEndTime(dayItems(plan, pmChoiceForDay), tourStart) : null;
  const timings = computeItemTimings(dayItems(plan, pmChoiceForDay), tourStart);
  const isLastDay = days.length > 0 && plan.day === Math.max(...days.map((d) => d.day));
  const gap = calcDayGap(plan, pmChoiceForDay, isLastDay);
  const dayEnd = calcDayEnd(plan, pmChoiceForDay);

  // 이 날 확인할 것 — 한 줄로 접어 두고 펼치면 설명과 고치기 버튼
  const drives = continuousDriving(plan, pmChoiceForDay);
  const offMeals = offRouteMeals(plan, pmChoiceForDay);
  // 식사 시간 점검 — 늦은 식사·저녁 두 번·같은 식당 두 줄·저녁 전 밤 일정·원문 시각
  const mealIssues = dayMealIssues(plan, pmChoiceForDay);
  const mealFit = mealIssues.length > 0 ? fitCourse([plan], { walk: false }) : null;
  const issueLabels = [
    ...(mealIssues.length > 0 ? ["식사 시간"] : []),
    ...(load.level === "overloaded" ? ["일정 과부하"] : load.level === "tight" ? ["일정 빠듯"] : []),
    ...(engine?.zigzags[plan.day] ? ["지그재그 동선"] : []),
    ...(drives.length > 0 ? ["기사 연속 운전"] : []),
    ...(offMeals.length > 0 ? ["동선 밖 식당"] : []),
    ...(dayEnd?.isLate ? [`늦은 종료 ${dayEnd.endTime}`] : []),
  ];

  return (
    <article id={`day-${plan.day}`} className="scroll-mt-3 rounded-lg border border-slate-200">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white">DAY {plan.day}</span>
        <h3 className="min-w-0 flex-1 basis-40 text-balance text-sm font-semibold text-slate-900">
          {plan.theme}
          {plan.rest && <span className="ml-1.5 rounded-full bg-emerald-50 px-2 py-0.5 align-middle text-[10.5px] font-medium text-emerald-700 ring-1 ring-emerald-200">{REST_LABEL[plan.rest]}</span>}
        </h3>
        {plan.overnightCity && (
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
            <BedDouble className="h-3 w-3" aria-hidden />
            {plan.overnightCity} 숙박{hotelName ? ` · ${hotelName}` : ""}
          </span>
        )}
        <label
          className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200"
          title="오전 미팅(투어 시작) 시각. 호텔 조식 이후 실제 투어가 시작되는 시각입니다."
        >
          <Flag className="h-3 w-3" aria-hidden />
          미팅
          <input
            type="time"
            value={meetingTime}
            aria-label="오전 미팅 시각"
            onChange={(e) => onChangeDay(plan.day, { meetingTime: e.target.value })}
            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
          />
        </label>
        {(lead > 0 || plan.hotelLeadMinutes !== undefined) && (
          <label
            className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200"
            title="호텔에서 미팅한 뒤 첫 장소까지 이동 시간. 첫 장소 시각 = 미팅 + 이동"
          >
            호텔→첫 장소
            <input
              type="number"
              min={0}
              max={240}
              step={5}
              value={lead}
              aria-label="호텔에서 첫 장소까지 이동 분"
              onChange={(e) => onChangeDay(plan.day, { hotelLeadMinutes: Math.max(0, Math.min(240, Math.round(Number(e.target.value) || 0))) })}
              className="w-12 rounded border border-slate-200 bg-white px-1 py-0.5 text-right text-[11px] tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
            분{lead > 0 ? ` (도착 ${tourStart})` : ""}
          </label>
        )}
        {load.totalMinutes > 0 && (
          <span
            title={`체류 ${formatDuration(load.stayMinutes)} + 이동 ${formatDuration(load.travelMinutes)}`}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ${LOAD_BADGE_TONE[load.level]}`}
          >
            <Clock className="h-3 w-3" aria-hidden />총 {formatDuration(load.totalMinutes)}
            {endTime ? ` (~${endTime} 종료)` : ""}
          </span>
        )}
        {score && (
          <button
            type="button"
            onClick={() => document.getElementById("course-engine")?.scrollIntoView({ block: "start", behavior: "smooth" })}
            title={score.top ? `가장 큰 감점 — ${score.top}` : "코스 엔진 점수"}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums ring-1 ${SCORE_TONE[score.grade]}`}
          >
            <Compass className="size-3" aria-hidden />
            {rescoring ? "다시 채점 중…" : `코스 ${score.score}점 ${score.grade}`}
          </button>
        )}
        {dayTime && placeCount >= 2 && (
          <button
            type="button"
            onClick={() => dayTime.run([plan.day])}
            disabled={dayTime.running !== null}
            title="하루 방문 순서를 웹에서 구역 단위(걸어서 함께 도는 장소 묶음)로 확인해 체류·이동 시간을 맞춥니다"
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-60 ${
              load.level === "overloaded" ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Timer className="size-3.5" aria-hidden />
            {dayTime.running?.includes(plan.day) ? "시간 확인 중..." : "시간 검증"}
          </button>
        )}
        {placeCount >= 3 && <ReorderButton dayNo={plan.day} compact />}
        {plan.kind === "linear" && plan.items.length > 0 && (
          <button
            type="button"
            onClick={() => onSaveSegment(plan.items, "day", plan.theme || `DAY ${plan.day}`)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            즐겨찾기
          </button>
        )}
      </header>
      <DayIssues labels={issueLabels}>
      {mealIssues.length > 0 && (
        <div className="flex flex-wrap items-start gap-1.5 border-b border-slate-100 bg-amber-50 px-4 py-2 text-[11px] leading-4 text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <ul aria-label="식사 시간 점검" className="min-w-0 flex-1 space-y-0.5 text-pretty">
            {mealIssues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {mealFit && mealFit.changes.length > 0 && (
            <button
              type="button"
              title={mealFit.changes.map((c) => c.note).join(" · ")}
              onClick={() => onChangeDay(plan.day, { items: mealFit.days[0].items })}
              className="shrink-0 rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold hover:bg-amber-100"
            >
              식사 시간 맞추기
            </button>
          )}
        </div>
      )}
      {load.level !== "ok" && (
        <p className={`flex items-start gap-1.5 border-b border-slate-100 px-4 py-2 text-[11px] leading-4 ${load.level === "overloaded" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {LOAD_WARNING[load.level]}
        </p>
      )}
      {engine?.zigzags[plan.day] && (
        <p className="flex flex-wrap items-start gap-1.5 border-b border-slate-100 bg-amber-50 px-4 py-2 text-[11px] leading-4 text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 text-pretty">
            지그재그 동선 — {engine.zigzags[plan.day].map((z) => `${z.from} → ${z.area}로 되돌아옴`).join(", ")}. 구역을 한 방향으로 돌아야 이동이 줄어듭니다.
            {!engine.zigzagFixable[plan.day] && " 식당 위치 때문이라 아래에서 동선상 식당으로 바꾸거나, 코스 엔진 점검으로 순서를 맞추세요."}
          </span>
          {engine.zigzagFixable[plan.day] ? (
            <button type="button" onClick={() => engine.groupAreas(plan.day)} className="shrink-0 rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold hover:bg-amber-100">
              구역 순서대로 묶기
            </button>
          ) : (
            <button
              type="button"
              onClick={() => document.getElementById("course-engine")?.scrollIntoView({ block: "start", behavior: "smooth" })}
              className="shrink-0 rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold hover:bg-amber-100"
            >
              코스 엔진 점검 보기
            </button>
          )}
        </p>
      )}
      {drives.map((w) => (
        <p key={`${w.from}-${w.to}`} className="flex items-start gap-1.5 border-b border-slate-100 bg-amber-50 px-4 py-2 text-[11px] leading-4 text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="text-pretty">
            기사 연속 운전 {formatDuration(w.minutes)} ({w.from} → {w.to}) — 국내 전세버스 기준은 4시간 연속 운전마다 30분 이상 휴게(15분씩 나눠 쉬기 가능)입니다. 중간에 휴게소·관광지 정차를 넣으세요. 해외는 현지 규정을 업체에 확인하세요.
          </span>
        </p>
      ))}
      {offMeals.map((m) => (
        <MealRoutePanel key={m.mealId} meal={m} destination={destination} travelers={travelers} tripScope={tripScope} currency={currency} onReplace={onChangeItem} />
      ))}
      {dayEnd?.isLate && (
        <p className="flex items-start gap-1.5 border-b border-slate-100 bg-amber-50 px-4 py-2 text-[11px] leading-4 text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          이 날짜는 {dayEnd.endTime}에 끝나 표준 종료 시각({STANDARD_DAY_END})을 넘깁니다. 근교투어·야간투어처럼 늦게 복귀하는 일정이 아니라면 코스를 조정하세요.
        </p>
      )}
      </DayIssues>

      <div className="space-y-5 p-4">
        {plan.kind === "linear" ? (
          <div>
            {gap && (
              <DayFillPanel
                dayNo={plan.day}
                gap={gap}
                destination={destination}
                city={city}
                currency={currency}
                tripScope={tripScope}
                existingNames={plan.items.map((i) => i.name)}
                onApply={onInsertItems}
              />
            )}
            <RouteCheckPanel items={plan.items} destination={destination} city={city} onApply={onReorderItems} />
            <RouteSketch plan={plan} items={plan.items} />
            <ol>
              {plan.items.map((item, index) => (
                <TimelineItem
                  key={item.id}
                  item={item}
                  order={index + 1}
                  isLast={index === plan.items.length - 1}
                  timing={timings.get(item.id)}
                  currency={currency}
                  dayNo={plan.day}
                  days={days}
                  tone="linear"
                  editing={editing}
                  onChangeItem={onChangeItem}
                  onDeleteItem={onDeleteItem}
                  onAddSuggestedOption={onAddSuggestedOption}
                  onMoveItem={onMoveItem}
                  onRelocateItem={onRelocateItem}
                  onSaveSegment={onSaveSegment}
                />
              ))}
            </ol>
            {editing && (
              <button
                type="button"
                onClick={() => onAddItem(plan.day)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                항목 추가
              </button>
            )}
          </div>
        ) : (
          <>
            <SessionBlock
              label="오전"
              sublabel="가이드 투어"
              icon={Sun}
              tone="am"
              items={plan.amGuided}
              timings={timings}
              destination={destination}
              city={city}
              currency={currency}
              dayNo={plan.day}
              days={days}
              editing={editing}
              onChangeItem={onChangeItem}
              onDeleteItem={onDeleteItem}
              onAddSuggestedOption={onAddSuggestedOption}
              onMoveItem={onMoveItem}
              onRelocateItem={onRelocateItem}
              onSaveSegment={onSaveSegment}
              onReorderItems={onReorderItems}
            />
            {selected && (
              <SessionBlock
                label="오후"
                sublabel="반자유 일정 · 코스를 선택하세요"
                icon={Sunset}
                tone="pm"
                items={selected.items}
                timings={timings}
                destination={destination}
                city={city}
                currency={currency}
                dayNo={plan.day}
                days={days}
                editing={editing}
                onChangeItem={onChangeItem}
                onDeleteItem={onDeleteItem}
                onAddSuggestedOption={onAddSuggestedOption}
                onMoveItem={onMoveItem}
                onRelocateItem={onRelocateItem}
                onSaveSegment={onSaveSegment}
                onReorderItems={onReorderItems}
              >
                <PmOptionSwitch
                  day={plan.day}
                  options={plan.pmFreeOptions}
                  selectedId={selected.id}
                  onSelect={onSelectPm}
                />
              </SessionBlock>
            )}
          </>
        )}
      </div>
    </article>
  );
}
