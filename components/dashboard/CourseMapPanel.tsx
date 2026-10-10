"use client";

import { Loader2, Map as MapIcon } from "lucide-react";
import { useContext, useState } from "react";
import { BACKTRACK_COLOR, CourseMap, dayColor } from "@/components/map/CourseMap";
import { SectionCard } from "@/components/ui/SectionCard";
import { CourseEngineContext } from "@/hooks/useCourseEngine";
import { formatDuration } from "@/lib/format";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { postJson } from "@/lib/api";
import { isCoord } from "@/lib/coords";
import { dayDistance, hotelLeadSuggestions, hotelPins, mapPoints, planRegions, regionRepeats } from "@/lib/regionPlan";
import type { DayPlan, ItineraryItem, SelectedHotel } from "@/types";

interface Props {
  days: DayPlan[];
  pmChoice: PmChoice;
  /** 다시 나눈 안 적용 (되돌리기 기록에 쌓인다) */
  onApply: (days: DayPlan[]) => void;
  onChangeItem: (itemId: string, patch: Partial<ItineraryItem>) => void;
  /** 고른 숙소 (숙박 도시별) — 좌표가 있으면 하루 동선의 출발·도착점 */
  hotels?: Record<string, SelectedHotel>;
  onHotelCoords?: (city: string, lat: number, lng: number) => void;
  onChangeDay?: (dayNo: number, patch: Partial<DayPlan>) => void;
  /** 숙소 위치 찾기에 쓰는 나라 이름 (여행지 문자열) */
  destination?: string;
}

const PLACE_TYPES = new Set(["sightseeing", "experience", "shopping", "massage"]);

/**
 * 코스 지도 · 지역 묶기 — 날짜별 색 핀과 순서 선(업계 방식: Wanderlog·Travefy), 하루 이동 거리,
 * 같은 지역을 여러 날 오가는 곳을 찾아 한 날로 모은 안을 전/후 비교로 보여 주고 적용한다.
 */
export function CourseMapPanel({ days, pmChoice, onApply, onChangeItem, hotels = {}, onHotelCoords, onChangeDay, destination = "" }: Props) {
  const engine = useContext(CourseEngineContext);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);

  const pins = hotelPins(hotels);
  const missingHotels = Object.entries(hotels).filter(([, h]) => h.name && !isCoord(h.lat, h.lng));
  const leads = hotelLeadSuggestions(days, pmChoice, pins);
  const locateHotels = async () => {
    setLocating(true);
    let found = 0;
    try {
      for (const [city, h] of missingHotels) {
        const r = await postJson<{ places: { name: string; lat: number; lng: number }[] }>("/api/place-coords", { city, country: destination, names: [h.name] });
        const p = r.places[0];
        if (p) {
          onHotelCoords?.(city, p.lat, p.lng);
          found += 1;
        }
      }
      setMessage(found > 0 ? `숙소 ${found}곳의 위치를 찾았습니다. 하루 동선이 숙소에서 출발해 숙소로 돌아옵니다.` : "숙소 위치를 찾지 못했습니다. 숙소 이름을 확인해 주세요.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "숙소 위치를 찾지 못했습니다.");
    } finally {
      setLocating(false);
    }
  };

  const points = mapPoints(days, pmChoice, pins);
  const places = days.flatMap((d) => dayItems(d, pmChoice)).filter((i) => PLACE_TYPES.has(i.type ?? "sightseeing"));
  const withCoord = places.filter((i) => typeof i.lat === "number").length;
  const repeats = regionRepeats(days, pmChoice, pins);
  const plan = repeats.length > 0 ? planRegions(days, pmChoice, pins) : null;
  const shown = days
    .map((d, index) => ({ day: d.day, index, points: points[index] }))
    .filter((d) => d.points.length > 0 && (selected === null || d.day === selected));
  const hasMapData = points.some((p) => p.length > 0);

  return (
    <SectionCard
      title="코스 지도 · 지역 묶기"
      description="날짜별 동선을 지도로 보고, 같은 지역을 여러 날 오가는 일정을 한 날로 모읍니다"
      icon={MapIcon}
      collapsible
      defaultOpen={false}
      summary={`좌표 ${withCoord}/${places.length}곳${repeats.length > 0 ? ` · 반복 지역 ${repeats.length}곳` : ""}`}
      anchorId="course-map"
    >
      <div className="space-y-3 text-xs">
        {withCoord < places.length && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
            <span className="text-slate-600">좌표를 모르는 곳 {places.length - withCoord}곳 — 코스 점검을 하면 장소 좌표를 찾아 지도에 넣습니다 (한 번 찾은 곳은 다시 찾지 않습니다).</span>
            {engine && (
              <button
                type="button"
                disabled={engine.running}
                onClick={() => void engine.run()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {engine.running && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                좌표 찾기 (코스 점검)
              </button>
            )}
          </div>
        )}

        {onHotelCoords && missingHotels.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
            <span className="text-slate-600">숙소 위치를 모릅니다 ({missingHotels.map(([, h]) => h.name).join(", ")}) — 찾으면 하루 동선을 숙소에서 출발·도착으로 그리고, 숙소 동네는 반복 지역으로 보지 않습니다.</span>
            <button type="button" disabled={locating} onClick={() => void locateHotels()} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {locating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              숙소 위치 찾기
            </button>
          </div>
        )}
        {onChangeDay && leads.length > 0 && (
          <ul aria-label="숙소에서 첫 장소까지" className="space-y-1 rounded-md border border-amber-200 bg-amber-50/50 p-2.5">
            {leads.map((l) => (
              <li key={l.day} className="flex flex-wrap items-center gap-2">
                <span className="text-amber-900">
                  DAY {l.day} {l.hotel} → {l.first}: 약 {formatDuration(l.minutes)} (일정표 {formatDuration(l.current)})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onChangeDay(l.day, { hotelLeadMinutes: l.minutes });
                    setMessage(`DAY ${l.day} 숙소에서 첫 장소까지를 ${formatDuration(l.minutes)}으로 맞췄습니다.`);
                  }}
                  className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  {formatDuration(l.minutes)}으로 맞추기
                </button>
              </li>
            ))}
          </ul>
        )}

        {hasMapData && (
          <>
            <div role="radiogroup" aria-label="지도에 보일 날" className="flex flex-wrap items-center gap-1.5">
              <button type="button" role="radio" aria-checked={selected === null} onClick={() => setSelected(null)} className={`rounded-full border px-2.5 py-1 font-medium ${selected === null ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600"}`}>
                전체
              </button>
              {days.map((d, i) => {
                const dist = dayDistance(points[i]);
                return points[i].length > 0 ? (
                  <button
                    key={d.day}
                    type="button"
                    role="radio"
                    aria-checked={selected === d.day}
                    onClick={() => setSelected(selected === d.day ? null : d.day)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${selected === d.day ? "border-slate-900 bg-slate-100 font-semibold" : "border-slate-300 bg-white"}`}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: dayColor(i) }} aria-hidden />
                    DAY {d.day}
                    {points[i].length >= 2 && <span className="tabular-nums text-slate-500">{dist.km}km · 약 {formatDuration(dist.minutes)}</span>}
                  </button>
                ) : null;
              })}
              <label className="ml-auto inline-flex items-center gap-1 text-slate-600">
                <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} />
                핀 위치 고치기
              </label>
            </div>
            <CourseMap
              days={shown}
              editable={editing}
              onMovePoint={(id, lat, lng) => {
                onChangeItem(id, { lat, lng, coordEdited: true });
                setMessage("위치를 고쳤습니다. 코스 점검·지역 묶기가 이 위치를 씁니다.");
              }}
            />
            <p className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span>번호 = 그날 방문 순서 · 흰 원 = 식사 · H = 숙소{Object.keys(pins).length > 0 ? " (전날 숙소에서 출발, 그날 숙소로 도착)" : ""}</span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: BACKTRACK_COLOR }} aria-hidden />
                떠났던 지역으로 되돌아가는 구간
              </span>
              <span>거리·시간은 직선거리로 어림한 값입니다.</span>
            </p>
          </>
        )}
        {!hasMapData && <p className="text-slate-500">아직 지도에 찍을 좌표가 없습니다. [좌표 찾기]를 누르면 날짜별 동선이 지도에 나옵니다.</p>}

        <section aria-label="여러 날 지역 묶기" className="space-y-2 rounded-md border border-slate-200 p-3">
          <p className="font-semibold text-slate-800">여러 날 지역 묶기</p>
          {repeats.length === 0 ? (
            <p className="text-slate-500">
              {withCoord > 0 || places.some((i) => i.timeCheck?.basis === "area")
                ? "같은 지역을 여러 날 나눠 가는 곳이 없습니다."
                : "장소의 지역을 아직 모릅니다. 좌표 찾기(코스 점검)나 시간 검증을 하면 확인합니다."}
            </p>
          ) : (
            <>
              <ul aria-label="반복 이동 지역" className="space-y-1">
                {repeats.map((r) => (
                  <li key={r.region} className="text-pretty">
                    <b className="text-amber-800">{r.region}</b> — DAY {r.days.join("·")}에 나눠 감 ({r.byDay.map((b) => `DAY ${b.day}: ${b.names.join(", ")}`).join(" / ")})
                    {r.extraMinutes !== null && r.extraMinutes > 0 && <span className="text-slate-500"> · 왕복 이동 약 {formatDuration(r.extraMinutes)} 더</span>}
                  </li>
                ))}
              </ul>
              {plan && plan.moves.length > 0 && (
                <div className="space-y-1.5 rounded-md bg-indigo-50/60 p-2.5">
                  <p className="font-semibold text-indigo-900">다시 나눈 안</p>
                  <ul className="space-y-0.5">
                    {plan.moves.map((m) => (
                      <li key={`${m.region}-${m.fromDay}`}>
                        {m.names.join(", ")} — DAY {m.fromDay} → <b>DAY {m.toDay}</b> ({m.region}, {formatDuration(m.minutes)})
                      </li>
                    ))}
                  </ul>
                  <p className="tabular-nums text-slate-700" aria-label="전후 비교">
                    반복 이동 {plan.before.repeats}번 → {plan.after.repeats}번
                    {plan.before.km !== null && plan.after.km !== null && ` · ${plan.withHotels ? "숙소 포함 이동 거리" : "장소 사이 이동 거리"} ${plan.before.km}km → ${plan.after.km}km${plan.withHotels ? "" : " (숙소 오가는 길 제외)"}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onApply(plan.days);
                      setMessage("지역별로 다시 나눴습니다. 식사 시간을 다시 맞췄으니 일정 카드에서 확인하세요. 되돌리기는 화면 위 [되돌리기] 또는 Ctrl+Z.");
                    }}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
                  >
                    이 안으로 적용
                  </button>
                </div>
              )}
              {plan && plan.skipped.length > 0 && (
                <ul className="space-y-0.5 text-slate-500">
                  {plan.skipped.map((s) => (
                    <li key={s}>· {s}</li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-slate-400">항공·공항 이동·숙소·점심·저녁·밤 일정과 선택관광은 움직이지 않습니다. 숙소가 있는 동네는 매일 오가므로 반복으로 보지 않습니다.</p>
            </>
          )}
        </section>
        {message && (
          <p role="status" className="text-emerald-700">
            {message}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
