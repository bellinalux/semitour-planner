import { AlertCircle, BookmarkPlus, Bus, Check, ChevronDown, ChevronUp, Clock, ExternalLink, Eye, Plane, Ticket, Trash2, Utensils, Wallet } from "lucide-react";
import { useItemView } from "./ItemView";
import { TravelLine } from "./TravelLine";
import { SelectBox } from "./Selection";
import { ItemGuide } from "@/components/guidebook/ItemGuide";
import type { AirportPlan } from "@/lib/airportStandard";
import { photoOf } from "@/lib/photo";
import { isBreakfastItem } from "@/lib/documents";
import { hm } from "@/lib/timezone";
import { useState } from "react";
import { DurationInput } from "@/components/ui/DurationInput";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { currencySymbol } from "@/lib/currency";
import type { ItemTiming } from "@/lib/dayLoad";
import { feeHint, isLocalPay } from "@/lib/fees";
import { formatDuration } from "@/lib/format";
import { feeLabel, ITEM_TYPE_META, ITEM_TYPES, stayTimeLabel } from "@/lib/itemTypes";
import { timeRange } from "@/lib/dayTidy";
import { resizeImage } from "@/lib/imageResize";
import type { SegmentKind } from "@/lib/segmentLibrary";
import type { Admission, CurrencyCode, DayPlan, ItemType, ItineraryItem, OptionSuggestion, TourSlot } from "@/types";
import { AccessibilityBox, FeeCheckBadges, RelocateControls, SuggestedOptions, selectClass, type ItemPatch } from "./TimelineItemParts";

export type { ItemPatch };
import { useFx } from "./FxContext";

interface Props {
  item: ItineraryItem;
  order: number;
  isLast: boolean;
  /** 오전 미팅 시각부터 계산한 이 코스의 시작·종료 시각 (조식 등 타임라인에서 제외된 항목은 없음) */
  timing?: ItemTiming;
  /** 오전 자유(미팅 전 자유시간) — 시각 대신 "호텔 조식 후", 마지막 줄 밑에 미팅 시각·호텔에서 이동 */
  beforeMeeting?: { last: boolean; meeting: string; lead: number };
  /** 이 시각의 나라 (항공이 있는 날 — 시차를 보이게 시각 앞에 붙인다) */
  zone?: string;
  /** 다음 항목도 항공인가 (출발 → 도착 사이만 "비행", 도착 뒤는 지상 이동) */
  nextIsFlight?: boolean;
  /** 항공 시각을 몰라 시각을 비운 항목 */
  untimed?: boolean;
  /** 출발 항공 — 공항 도착·탑승 수속 마감 업계 기준 */
  airport?: AirportPlan;
  /** 이 항목의 도시 (가이드 원고를 만들 때) */
  city?: string;
  currency: CurrencyCode;
  /** 이 항목이 속한 일차 (추천 옵션을 "선택 옵션"으로 추가할 때 필요) */
  dayNo: number;
  /** 다른 날로 이동·복사할 대상을 고를 때 쓰는 전체 일정 */
  days: DayPlan[];
  /** am/pm: 세미투어 오전/오후 (번호 표시) — linear: 업체 코스 (유형 이모지 표시) */
  tone: "am" | "pm" | "linear";
  editing: boolean;
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onDeleteItem: (itemId: string) => void;
  onAddSuggestedOption: (suggestion: OptionSuggestion, dayNo: number) => void;
  onMoveItem: (itemId: string, direction: "up" | "down") => void;
  onRelocateItem: (itemId: string, targetDay: number, targetSlot: TourSlot, mode: "move" | "copy") => void;
  onSaveSegment: (items: ItineraryItem[], kind: SegmentKind, defaultName: string) => void;
}

const TONE = {
  am: { node: "bg-indigo-600 text-white", rail: "bg-indigo-200" },
  pm: { node: "bg-emerald-600 text-white", rail: "bg-emerald-200" },
  linear: { node: "bg-slate-100 text-base ring-1 ring-slate-200", rail: "bg-slate-200" },
} as const;

const ADMISSION_LABELS: Record<Admission, string> = {
  enter: "입장",
  view_only: "외부 조망만",
  none: "해당 없음",
  unknown: "미확인",
};


/** 비용 입력창을 보여줄 유형. 유형이 없는 항목(AI 세미투어)은 둘 다 보여준다. */
const NO_COST_TYPES: ItemType[] = ["flight", "transfer", "hotel", "free_time"];
function costFields(type: ItemType | undefined) {
  if (type === undefined) return { fee: true, meal: true };
  if (NO_COST_TYPES.includes(type)) return { fee: false, meal: false };
  if (type === "meal") return { fee: false, meal: true };
  return { fee: true, meal: false };
}

export function TimelineItem({
  item,
  order,
  isLast,
  timing,
  beforeMeeting,
  zone,
  nextIsFlight,
  untimed,
  airport,
  city,
  currency,
  dayNo,
  days,
  tone,
  editing,
  onChangeItem,
  onDeleteItem,
  onAddSuggestedOption,
  onMoveItem,
  onRelocateItem,
  onSaveSegment,
}: Props) {
  const symbol = currencySymbol(currency);
  const { rate } = useFx();
  const [favorited, setFavorited] = useState(false);
  const { fee, meal } = costFields(item.type);
  const typeMeta = ITEM_TYPE_META[item.type ?? "sightseeing"];
  const showEstimateTag = fee || meal;
  const localPay = isLocalPay(item);
  const check = item.feeCheck;
  // 자유시간·조식은 장소가 아니다 — 사진·즐겨찾기·AI 추정 표시를 두지 않는다
  const notPlace = item.type === "free_time" || isBreakfastItem(item);
  // 간단히 보기: 한 줄 요약 (누르면 이 항목만 펼침). 편집 중이거나 자세히 보기면 입력칸을 모두 보인다
  const view = useItemView();
  const [open, setOpen] = useState(false);
  const compact = !editing && view === "compact" && !open;
  const canFold = !editing && view === "compact";
  const cost = (fee ? item.entryFee : 0) + (meal ? item.mealCost : 0);
  const showStay = item.stayMinutes > 0 && item.type !== "flight" && item.type !== "transfer";
  // 가이드 원고를 붙일 항목 (장소만 — 항공·이동·숙소·자유시간·식사 제외)
  const guideless = notPlace || ["flight", "transfer", "hotel", "free_time", "meal"].includes(item.type ?? "sightseeing");
  const estimated = item.isEstimated && !notPlace && (fee || meal || showStay) && !["flight", "transfer", "hotel"].includes(item.type ?? "");

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${TONE[tone].node}`}
          title={tone === "linear" ? typeMeta.label : undefined}
        >
          {tone === "linear" ? typeMeta.emoji : order}
        </span>
        {!isLast && <span className={`my-1 w-0.5 flex-1 ${TONE[tone].rail}`} aria-hidden />}
      </div>

      <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-3"}`}>
        {beforeMeeting ? (
          <p className="mb-0.5 text-[11px] font-semibold text-indigo-600" title="오전 자유 — 미팅 전 시간이라 시각을 매기지 않습니다 (업계 일정표 표기)">
            호텔 조식 후
          </p>
        ) : (
          untimed ? (
            <p className="mb-0.5 text-[11px] font-semibold text-amber-700" title="항공편을 넣으면 실제 시각으로 계산합니다">
              {zone && <span className="mr-1 rounded bg-amber-50 px-1 text-[10px] font-semibold ring-1 ring-amber-200">{zone}</span>}
              항공 시각 미정
            </p>
          ) : timing && (
            <p className="mb-0.5 text-[11px] font-semibold tabular-nums text-indigo-600" title="오전 미팅 시각부터 계산한 예상 시작·종료 시각 (그 나라 현지 시각)">
              {zone && <span className="mr-1 rounded bg-indigo-50 px-1 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200">{zone}</span>}
              {timeRange(timing)}
            </p>
          )
        )}
        {editing ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <SelectBox id={item.id} name={item.name} />
            <input
              aria-label="항목 이름"
              value={item.name}
              onChange={(e) => onChangeItem(item.id, { name: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
            <select
              aria-label="항목 유형"
              value={item.type ?? "sightseeing"}
              onChange={(e) => onChangeItem(item.id, { type: e.target.value as ItemType })}
              className={selectClass}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ITEM_TYPE_META[t].emoji} {ITEM_TYPE_META[t].label}
                </option>
              ))}
            </select>
            <select
              aria-label="입장 여부"
              value={item.admission ?? "unknown"}
              onChange={(e) => {
                const admission = e.target.value as Admission;
                // 외부 조망이면 입장료는 없다 (해당 없음이어도 마사지·체험처럼 요금은 있을 수 있다)
                onChangeItem(item.id, admission === "view_only" ? { admission, entryFee: 0 } : { admission });
              }}
              className={selectClass}
            >
              {(Object.keys(ADMISSION_LABELS) as Admission[]).map((a) => (
                <option key={a} value={a}>
                  {ADMISSION_LABELS[a]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onMoveItem(item.id, "up")}
              disabled={order === 1}
              aria-label={`${item.name} 위로 이동`}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onMoveItem(item.id, "down")}
              disabled={isLast}
              aria-label={`${item.name} 아래로 이동`}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onDeleteItem(item.id)}
              aria-label={`${item.name} 삭제`}
              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : canFold ? (
          <h4 className="text-sm font-semibold text-slate-900">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              title={open ? "접기" : "체류·금액·판매가 포함 등 자세히 보기"}
              className="inline-flex items-center gap-1 text-left hover:text-indigo-700"
            >
              {item.name}
              <ChevronDown className={`size-3.5 shrink-0 text-slate-400 ${open ? "rotate-180" : ""}`} aria-hidden />
            </button>
          </h4>
        ) : (
          <h4 className="text-sm font-semibold text-slate-900">{item.name}</h4>
        )}

        {airport && (
          <div role="note" aria-label="출국 수속 기준" className={`mt-1 rounded-md px-2.5 py-1.5 text-[11px] leading-4 ${airport.warning ? "bg-rose-50 text-rose-800" : "bg-sky-50 text-sky-900"}`}>
            <p className="flex items-start gap-1.5">
              <Plane className="mt-px size-3.5 shrink-0" aria-hidden />
              <span className="text-pretty">
                <b>출국 수속</b> — {airport.text}
              </span>
            </p>
            <p className="mt-0.5 pl-5 text-[10.5px] opacity-80">탑승 수속·보안 검색·출국 심사 시간 (업계 기준: 공항·항공사 안내, 단체는 여행사 공항 집결). 마감 시각은 발권 항공사로 확인</p>
            {airport.warning && <p className="mt-1 pl-5 font-semibold">{airport.warning}</p>}
          </div>
        )}
        {editing && <RelocateControls item={item} dayNo={dayNo} days={days} onRelocateItem={onRelocateItem} />}
        {photoOf(item) && !compact && (
          // eslint-disable-next-line @next/next/no-img-element -- 직접 올린 사진 data URL
          <img src={photoOf(item)!.src} alt={`${item.name} 사진`} title={photoOf(item)!.credit} className="mt-1 h-20 w-32 rounded-md object-cover ring-1 ring-slate-200" />
        )}
        {editing && !notPlace && (
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50">
              {item.photo ? "사진 바꾸기" : "사진 올리기"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={`${item.name} 사진 올리기`}
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    onChangeItem(item.id, { photo: await resizeImage(file, 640) });
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : "사진을 올리지 못했습니다.");
                  }
                }}
              />
            </label>
            {item.photo && (
              <button type="button" onClick={() => onChangeItem(item.id, { photo: undefined })} className="text-slate-500 underline">
                사진 빼기
              </button>
            )}
            <span className="text-slate-400">직접 찍거나 사용권이 있는 사진만 (일정표·소개서·웹 링크에 들어갑니다)</span>
          </div>
        )}

        {compact ? (
          <>
            {item.description && (
              <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-slate-500" title={item.description}>
                {item.description}
              </p>
            )}
            {/* 한 줄 요약 — 체류 · 금액 · 확인 상태 · 주의 */}
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-600">
              {photoOf(item) && (
                // eslint-disable-next-line @next/next/no-img-element -- 직접 올린 사진 data URL
                <img src={photoOf(item)!.src} alt={`${item.name} 사진`} title={photoOf(item)!.credit} className="h-7 w-10 rounded object-cover ring-1 ring-slate-200" />
              )}
              {showStay && (
                <span className="inline-flex items-center gap-1 tabular-nums" title={`${stayTimeLabel(item.type)} 시간`}>
                  <Clock className="size-3 text-slate-400" aria-hidden />
                  {formatDuration(item.stayMinutes)}
                </span>
              )}
              {item.type === "hotel" && item.stayMinutes === 0 && <span className="text-slate-500">투숙</span>}
              {item.timeNote && <span className="text-slate-500">{item.timeNote}</span>}
              {item.fixedTime && item.type !== "flight" && (
                <span className="rounded bg-violet-50 px-1.5 font-medium text-violet-700 ring-1 ring-violet-200">{item.fixedTime} 고정</span>
              )}
              {cost > 0 && (
                <span className="tabular-nums" title={feeHint(cost, item, currency, rate)}>
                  {meal && !fee ? "식대" : feeLabel(item.type)} {symbol}
                  {cost.toLocaleString("ko-KR")}
                </span>
              )}
              {(fee || meal) && localPay && <span className="rounded bg-orange-50 px-1.5 font-semibold text-orange-700 ring-1 ring-orange-200">현지 지불</span>}
              {item.admission === "view_only" && <span className="text-sky-700">외부 조망</span>}
              {item.timeCheck?.basis === "area" ? (
                <span className="text-indigo-700" title="하루 방문 순서를 웹에서 구역 단위로 확인한 시간">
                  ✓ 구역 확인{item.timeCheck.area ? ` · ${item.timeCheck.area}` : ""}
                </span>
              ) : item.timeCheck?.basis === "place" || item.feeCheck?.stayMinutesChecked ? (
                <span className="text-emerald-700">✓ 장소 확인</span>
              ) : (
                estimated && (
                  <span className="inline-flex items-center gap-1 text-amber-700" title="AI가 추정한 시간·금액 — 입장료·체류시간 웹 확인이나 시간 검증으로 확인하세요">
                    <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
                    추정
                  </span>
                )
              )}
              {item.caution && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-amber-800" title={item.caution}>
                  <AlertCircle className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{item.caution}</span>
                </span>
              )}
              <FeeCheckBadges item={item} symbol={symbol} onChangeItem={onChangeItem} />
              {!guideless && <ItemGuide itemName={item.name} city={city} stayMinutes={item.stayMinutes} onStay={(stayMinutes) => onChangeItem(item.id, { stayMinutes, stayEdited: true })} allowCreate={false} />}
            </div>
          </>
        ) : (
          <>
            {item.description && <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {(item.type === "flight" || item.type === "transfer") && !editing ? null : item.type === "hotel" && item.stayMinutes === 0 && !editing ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600" title="그날 마지막 숙소는 머무는 시간을 두지 않습니다 (편집에서 바꿀 수 있음)">
                  투숙 · 체류시간 없음
                </span>
              ) : (
                <DurationInput label={stayTimeLabel(item.type)} icon={Clock} value={item.stayMinutes} onChange={(stayMinutes) => onChangeItem(item.id, { stayMinutes })} />
              )}
              {item.timeNote && (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600" title="원문에 적힌 소요 시간 표기">
                  {item.timeNote}
                </span>
              )}
              {/* 정해진 시각 — 공연·크루즈 출항·기차·페리처럼 시각이 정해진 것. 앞 일정이 그 시각에 맞춰지고, 못 맞추면 불가능 시간 */}
              {editing && item.type !== "flight" ? (
                <label className="inline-flex items-center gap-1 rounded-md bg-slate-100 py-0.5 pl-2 pr-1 text-[11px] font-medium text-slate-600" title="공연·크루즈 출항·기차처럼 시작 시각이 정해져 있으면 넣으세요">
                  정해진 시각
                  <input
                    type="time"
                    value={item.fixedTime ?? ""}
                    aria-label={`${item.name} 정해진 시각`}
                    onChange={(e) => onChangeItem(item.id, { fixedTime: e.target.value || undefined })}
                    className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] tabular-nums text-slate-900"
                  />
                </label>
              ) : (
                item.fixedTime &&
                item.type !== "flight" && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200" title="시작 시각이 정해진 일정 — 앞 일정이 이 시각에 맞춰집니다">
                    <Clock className="size-3" aria-hidden />
                    {item.fixedTime} 고정
                  </span>
                )
              )}
              {/* 체류 시간을 어디서 확인했는지: 구역 확인(하루 순서 통째로) / 장소 확인(장소 하나만) / AI 추정 */}
              {item.timeCheck?.basis === "area" ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                  title={`하루 방문 순서를 웹에서 확인해 구역 단위(걸어서 함께 도는 장소 묶음)로 맞춘 시간${item.timeCheck.sourceName ? ` · 출처: ${item.timeCheck.sourceName}` : ""}`}
                >
                  <Check className="size-3" aria-hidden />
                  구역 확인{item.timeCheck.area ? ` · ${item.timeCheck.area}` : ""}
                </span>
              ) : null}
              {item.timeCheck?.basis === "area" && (item.timeCheck.dropOff || item.timeCheck.pickUp) ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                  title="차량이 못 들어가는 걷기 구역 — 한 방향으로 걷고 차량은 반대편에서 기다립니다. 가이드·기사에게 미리 알려 주세요"
                >
                  <Bus className="size-3" aria-hidden />
                  {[item.timeCheck.dropOff && `하차 ${item.timeCheck.dropOff}`, item.timeCheck.pickUp && `픽업 ${item.timeCheck.pickUp}`].filter(Boolean).join(" → 걸어서 → ")}
                </span>
              ) : null}
              {item.timeCheck?.basis === "area" ? null : item.timeCheck?.basis === "place" || item.feeCheck?.stayMinutesChecked ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                  title={`이 장소 하나만 웹에서 확인한 통상적인 ${stayTimeLabel(item.type)} 시간 — 걸어서 함께 도는 장소들이면 일정 카드의 '시간 검증'으로 구역 단위로 맞추세요`}
                >
                  <Check className="size-3" aria-hidden />
                  장소 확인
                </span>
              ) : (
                item.isEstimated &&
                item.stayMinutes > 0 &&
                !notPlace &&
                !["flight", "transfer", "hotel"].includes(item.type ?? "") && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500" title="AI가 추정한 시간 — 일정 카드의 '시간 검증'으로 확인할 수 있습니다">
                    AI 추정
                  </span>
                )
              )}
              {item.fromCatalog && (
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">투어 카탈로그</span>
              )}
              {notPlace ? null : favorited ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <Check className="h-3 w-3" aria-hidden />
                  즐겨찾기됨
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onSaveSegment([item], "place", item.name);
                    setFavorited(true);
                  }}
                  title="이 장소를 라이브러리에 저장해 다음에 검색으로 바로 넣을 수 있게 합니다"
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-amber-50 hover:text-amber-700"
                >
                  <BookmarkPlus className="h-3 w-3" aria-hidden />
                  즐겨찾기
                </button>
              )}
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                >
                  예약처 검색
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
              {item.admission === "view_only" && !editing && (
                <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                  <Eye className="h-3 w-3" aria-hidden />
                  외부 조망
                </span>
              )}
              {fee && (
                <MoneyInput
                  label={feeLabel(item.type)}
                  icon={Ticket}
                  symbol={symbol}
                  value={item.entryFee}
                  onChange={(entryFee) => onChangeItem(item.id, { entryFee })}
                />
              )}
              {meal && (
                <MoneyInput
                  label="식대"
                  icon={Utensils}
                  symbol={symbol}
                  value={item.mealCost}
                  onChange={(mealCost) => onChangeItem(item.id, { mealCost })}
                />
              )}
              {meal && (
                <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 py-0.5 pl-2 pr-1 text-[11px] font-medium text-slate-600">
                  음식 종류
                  <input
                    type="text"
                    value={item.cuisine ?? ""}
                    placeholder="현지식"
                    aria-label="음식 종류"
                    onChange={(e) => onChangeItem(item.id, { cuisine: e.target.value })}
                    className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                </label>
              )}
              {(fee || meal) && (item.entryFee > 0 || item.mealCost > 0) && (
                <span className="text-[11px] font-medium tabular-nums text-slate-500" title="현지 금액과 원화 환산 (환율은 왼쪽 '원화 환율'에 입력한 값)">
                  {feeHint(item.entryFee + item.mealCost, item, currency, rate)}
                </span>
              )}
              {showEstimateTag && (
                <span
                  className={`text-[10px] font-medium ${check && check.status !== "unverified" ? "text-emerald-600" : item.isEstimated ? "text-amber-600" : "text-emerald-600"}`}
                  title={item.isEstimated ? "AI 추정치 — 실제 금액을 확인하세요" : check && check.status !== "unverified" ? "웹에서 확인한 금액" : "직접 수정한 금액"}
                >
                  {item.isEstimated ? "AI 추정" : check && check.status !== "unverified" ? "웹 확인" : "직접 입력"}
                </span>
              )}
              {(fee || meal) && (
                <button
                  type="button"
                  aria-pressed={localPay}
                  onClick={() => onChangeItem(item.id, { payment: localPay ? "included" : "local" })}
                  title={localPay ? "고객이 현지에서 직접 내는 항목입니다. 판매가와 원가에 넣지 않습니다. 누르면 판매가 포함으로 바뀝니다." : "판매가에 포함되는 항목입니다. 누르면 현지 지불(불포함)로 바뀝니다."}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                    localPay ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Wallet className="h-3 w-3" aria-hidden />
                  {localPay ? "현지 지불(불포함)" : "판매가 포함"}
                </button>
              )}
              <FeeCheckBadges item={item} symbol={symbol} onChangeItem={onChangeItem} />
              {!guideless && !editing && <ItemGuide itemName={item.name} city={city} stayMinutes={item.stayMinutes} onStay={(stayMinutes) => onChangeItem(item.id, { stayMinutes, stayEdited: true })} allowCreate />}
            </div>

            {check && (check.sourceName || check.note) && (
              <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                {check.sourceName ? `확인 출처: ${check.sourceName}` : ""}
                {check.sourceName && check.note ? " · " : ""}
                {check.note}
              </p>
            )}

            {item.reason && (
              <p className="mt-1.5 text-[11px] leading-4 text-indigo-700">
                <span className="mr-1 rounded bg-indigo-50 px-1 font-semibold ring-1 ring-indigo-200">근거</span>
                {item.reason}
              </p>
            )}

            {item.caution && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                {item.caution}
              </p>
            )}
            {canFold && (
              <button type="button" onClick={() => setOpen(false)} className="mt-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800">
                접기 ▲
              </button>
            )}
          </>
        )}

        <AccessibilityBox item={item} onDeleteItem={onDeleteItem} />

        <SuggestedOptions item={item} dayNo={dayNo} currency={currency} rate={rate} onAddSuggestedOption={onAddSuggestedOption} />

        {beforeMeeting?.last && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <Bus className="h-3 w-3" aria-hidden />
            <span className="tabular-nums">{beforeMeeting.meeting}</span> 호텔 로비 미팅{beforeMeeting.lead > 0 ? ` → 다음 장소까지 이동 ${formatDuration(beforeMeeting.lead)}` : ""}
          </p>
        )}
        {!beforeMeeting && !isLast && item.travelMinutesToNext !== null && item.travelMinutesToNext > 0 && item.type !== "flight" && (
          <TravelLine minutes={item.travelMinutesToNext} label={`${item.name} 다음 장소까지 이동`} onChange={(travelMinutesToNext) => onChangeItem(item.id, { travelMinutesToNext })} />
        )}
        {!beforeMeeting && !isLast && item.travelMinutesToNext !== null && item.travelMinutesToNext > 0 && item.type === "flight" && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Bus className="h-3 w-3" aria-hidden />
            {item.type === "flight" && nextIsFlight
              ? item.flightInfo
                ? `비행 ${hm(item.flightInfo.minutes)}${item.flightInfo.estimated ? " (노선 추정)" : ""}${item.flightInfo.tzMinutes !== 0 ? ` · 시차 ${item.flightInfo.tzMinutes > 0 ? "+" : "−"}${hm(Math.abs(item.flightInfo.tzMinutes))} → 현지 시각 차이 ${hm(item.travelMinutesToNext)}` : ""}`
                : `비행 ${formatDuration(item.travelMinutesToNext)} (현지 시각 차이 — 시차 포함)`
              : item.type === "flight"
                ? `공항에서 다음 장소까지 이동 ${formatDuration(item.travelMinutesToNext)}`
                : `다음 장소까지 이동 ${formatDuration(item.travelMinutesToNext)}`}
          </p>
        )}
      </div>
    </li>
  );
}
