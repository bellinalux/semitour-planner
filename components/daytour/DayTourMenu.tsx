"use client";

import { Bus, FolderOpen, Loader2, Route, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useRequest } from "@/hooks/useRequest";
import { initialSettings, vehicleFor, type DayTourSettings, type Departure } from "@/lib/dayTour";
import { deleteDayTour, loadCompanyDefaults, loadSavedDayTours, saveDayTour, type SavedDayTour } from "@/lib/dayTourStore";
import { CURRENCIES } from "@/lib/currency";
import type { DayTourLeg, DayTourRequest, DayTourResponse, DayTourStop, DayTourTransport } from "@/lib/schemas/dayTour";
import type { TourCandidate, TripInput } from "@/types";
import { DayTourResult } from "./DayTourResult";

interface Props {
  input: TripInput;
  /** 지금 일정의 날짜 수 (선택관광으로 넣을 날 고르기, 0이면 일정 없음) */
  dayCount: number;
  onAddOption: (tour: TourCandidate, dayNo: number, price: { cost: number; sale: number }) => void;
  buttonClassName?: string;
  company?: { name: string; phone: string; email: string };
}

const TRANSPORTS: { id: DayTourTransport; label: string; hint: string }[] = [
  { id: "vehicle", label: "차량", hint: "전용 차량·기사" },
  { id: "transit", label: "대중교통", hint: "전철·버스·기차 + 도보" },
  { id: "walk", label: "도보", hint: "걸어서 도는 워킹 투어" },
  { id: "mixed", label: "섞어서 (자동)", hint: "구간마다 알맞은 수단" },
];

const fieldClass = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

const blankRequest = (input: TripInput): DayTourRequest => ({
  base: input.destination.split(",")[0]?.trim() ?? "",
  area: "",
  length: "full",
  transport: "vehicle",
  travelers: Math.max(1, Math.min(90, input.travelers || 2)),
  theme: "",
  guide: true,
  lunch: true,
  start: "09:00",
  garage: "",
  vehicleClass: "",
  currency: input.currency,
  tripScope: input.tripScope ?? "domestic",
});

export interface DayTourWork {
  id: string;
  request: DayTourRequest;
  response: DayTourResponse;
  title: string;
  summary: string;
  stops: DayTourStop[];
  legs: DayTourLeg[];
  settings: DayTourSettings;
  /** 고객용 웹 링크 (만들었으면) */
  shareId?: string;
  /** 합류형 정기 출발 (날짜별 판매 좌석)과 최소·최대 좌석 */
  departures?: Departure[];
  minSeats?: number;
  maxSeats?: number;
}

/** 상단 [근교 투어] — 반일·당일 근교 투어의 코스(차량·대중교통·도보)와 원가·판매가를 자동으로 만든다 */
export function DayTourMenu({ input, dayCount, onAddOption, buttonClassName, company = { name: "", phone: "", email: "" } }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [req, setReq] = useState<DayTourRequest>(() => blankRequest(input));
  const [work, setWork] = useState<DayTourWork | null>(null);
  const [saved, setSaved] = useState<SavedDayTour[]>([]);
  const [notice, setNotice] = useState("");
  const api = useRequest<DayTourRequest, DayTourResponse>("/api/day-tour");
  const set = (patch: Partial<DayTourRequest>) => setReq((r) => ({ ...r, ...patch }));
  const usesVehicle = req.transport === "vehicle" || req.transport === "mixed";

  const open = () => {
    setSaved(loadSavedDayTours());
    // 처음 열 때는 지금 견적의 여행지·인원·통화로 시작
    if (!work && !req.base) setReq(blankRequest(input));
    dialogRef.current?.showModal();
  };

  const generate = async () => {
    setNotice("");
    const request = { ...req, vehicleClass: usesVehicle ? vehicleFor(req.travelers).label : "" };
    const res = await api.run(request);
    if (!res) return;
    setWork({
      id: `dt-${crypto.randomUUID().slice(0, 8)}`,
      request,
      response: res,
      title: res.title,
      summary: res.summary,
      stops: res.stops,
      legs: res.legs,
      settings: initialSettings(res, request, loadCompanyDefaults()),
    });
  };

  const save = () => {
    if (!work) return;
    setSaved(saveDayTour({ ...work, savedAt: new Date().toISOString() }));
    setNotice("저장했습니다 (이 브라우저).");
  };

  const load = (t: SavedDayTour) => {
    setReq(t.request);
    setWork({ id: t.id, request: t.request, response: t.response, title: t.title, summary: t.summary, stops: t.stops, legs: t.legs, settings: t.settings, shareId: t.shareId, departures: t.departures, minSeats: t.minSeats, maxSeats: t.maxSeats });
    setNotice("");
  };

  return (
    <>
      <button type="button" onClick={open} className={buttonClassName} aria-haspopup="dialog">
        <Bus className="h-3.5 w-3.5" aria-hidden />
        <span>근교 투어</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="day-tour-title"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-5xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[92dvh] flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 id="day-tour-title" className="text-sm font-semibold text-slate-900">
                근교 투어 만들기 (반일·당일)
              </h2>
              <p className="mt-0.5 text-pretty text-[11px] text-slate-500">코스와 이동(차량·대중교통·도보), 유류비·통행료·인건비로 원가와 판매가를 계산합니다.</p>
            </div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="space-y-4 overflow-y-auto p-4 text-xs">
            <section aria-label="근교 투어 조건" className="space-y-3 rounded-lg border border-slate-200 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-[11px] text-slate-500">출발·복귀 기준지 (호텔·역·도시)</span>
                  <input className={fieldClass} value={req.base} onChange={(e) => set({ base: e.target.value })} placeholder="예) 서울 명동, 오사카 난바역" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-slate-500">가고 싶은 지역 (비우면 자동)</span>
                  <input className={fieldClass} value={req.area} onChange={(e) => set({ area: e.target.value })} placeholder="예) 가평, 교토 아라시야마" />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div role="radiogroup" aria-label="투어 길이" className="flex gap-1">
                  {(["half", "full"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={req.length === l}
                      onClick={() => set({ length: l })}
                      className={`rounded-full border px-3 py-1 font-medium ${req.length === l ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"}`}
                    >
                      {l === "half" ? "반일 (4~5시간)" : "당일 (8~10시간)"}
                    </button>
                  ))}
                </div>
                <div role="radiogroup" aria-label="이동 방식" className="flex flex-wrap gap-1">
                  {TRANSPORTS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={req.transport === t.id}
                      title={t.hint}
                      onClick={() => set({ transport: t.id })}
                      className={`rounded-full border px-3 py-1 font-medium ${req.transport === t.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-emerald-300"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className="grid gap-1">
                  <span className="text-[11px] text-slate-500">인원</span>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    aria-label="인원"
                    className={`${fieldClass} tabular-nums`}
                    value={req.travelers}
                    onChange={(e) => set({ travelers: Math.max(1, Math.min(90, Math.round(Number(e.target.value) || 1))) })}
                  />
                  {usesVehicle && <span className="text-[10px] text-slate-400">{vehicleFor(req.travelers).label}{vehicleFor(req.travelers).count > 1 ? ` × ${vehicleFor(req.travelers).count}대` : ""}</span>}
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-slate-500">출발 시각</span>
                  <input type="time" className={`${fieldClass} tabular-nums`} value={req.start} onChange={(e) => set({ start: e.target.value || "09:00" })} />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-slate-500">통화</span>
                  <select className={fieldClass} value={req.currency} onChange={(e) => set({ currency: e.target.value as DayTourRequest["currency"] })}>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-slate-500">국내·해외</span>
                  <select className={fieldClass} value={req.tripScope} onChange={(e) => set({ tripScope: e.target.value as DayTourRequest["tripScope"] })}>
                    <option value="domestic">국내</option>
                    <option value="overseas">해외</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-[11px] text-slate-500">테마·요청 (선택)</span>
                  <input className={fieldClass} value={req.theme} onChange={(e) => set({ theme: e.target.value })} placeholder="예) 자연·사진, 역사, 아이 동반, 미식" />
                </label>
                {usesVehicle && (
                  <label className="grid gap-1">
                    <span className="text-[11px] text-slate-500">차고지 (선택 — 공차 거리 계산)</span>
                    <input className={fieldClass} value={req.garage} onChange={(e) => set({ garage: e.target.value })} placeholder="예) 경기 하남 차고지" />
                  </label>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={req.guide} onChange={(e) => set({ guide: e.target.checked })} />
                  가이드 동행
                </label>
                {req.length === "full" && (
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={req.lunch} onChange={(e) => set({ lunch: e.target.checked })} />
                    점심 포함
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={!req.base.trim() || api.state.status === "loading"}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {api.state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Route className="h-4 w-4" aria-hidden />}
                  {api.state.status === "loading" ? "코스·시세 조사 중…" : work ? "다시 만들기" : "코스·원가 만들기"}
                </button>
              </div>
              {api.state.status === "loading" && <p className="text-[11px] text-slate-500">웹에서 코스·거리·유가·인건비·비슷한 투어 요금을 조사합니다. 1~2분 걸릴 수 있습니다.</p>}
            </section>

            {api.state.status === "error" && <ErrorBanner title="근교 투어를 만들지 못했습니다" message={api.state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={() => void generate()} />}

            {work && (
              <DayTourResult
                work={work}
                onChange={(patch) => setWork((w) => (w ? { ...w, ...patch } : w))}
                dayCount={input.currency === work.request.currency ? dayCount : 0}
                currencyMismatch={input.currency !== work.request.currency}
                onAddOption={onAddOption}
                onSave={save}
                notice={notice}
                company={company}
              />
            )}

            {saved.length > 0 && (
              <details className="rounded-lg border border-slate-200 px-3 py-2">
                <summary className="cursor-pointer font-semibold text-slate-700">저장한 근교 투어 ({saved.length})</summary>
                <ul className="mt-2 divide-y divide-slate-100">
                  {saved.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate">
                        <b className="text-slate-800">{t.title}</b>
                        <span className="ml-1.5 text-slate-400">
                          {t.request.length === "full" ? "당일" : "반일"} · {t.request.travelers}명 · {new Date(t.savedAt).toLocaleDateString()}
                        </span>
                      </span>
                      <button type="button" onClick={() => load(t)} className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline">
                        <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                        열기
                      </button>
                      <button type="button" onClick={() => {
                          if (window.confirm(`"${t.title}"을(를) 지울까요?`)) setSaved(deleteDayTour(t.id));
                        }} aria-label={`${t.title} 지우기`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
