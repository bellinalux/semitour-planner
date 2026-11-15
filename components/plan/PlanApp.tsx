"use client";

import { ArrowDown, ArrowUp, Loader2, MapPin, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlaybackMap, type PlaybackPoint } from "@/components/plan/PlaybackMap";
import { parseClock } from "@/lib/dayLoad";
import { dayTimes, isTourItem, lightenDay, moveItem, planSummary, removeItem, swapItem, transitLink, transportOptions } from "@/lib/planEdit";
import { COMPANION_LABEL, PACE_LABEL, priceNoteFor, THEME_IDS, THEME_LABEL, type PublicPlanRequest, type PublicPlanResult } from "@/lib/publicPlan";
import type { DayPlan } from "@/types";

interface Config {
  enabled: boolean;
  notice: string;
  showPrice: boolean;
  priceTable: { match: string; text: string }[];
  turnstileSiteKey: string;
  company: { name: string; logo: string; color: string; phone: string; email: string };
}
interface Recommend {
  courses: { title: string; places: string[]; note: string }[];
  popular: { name: string; count: number }[];
}
type City = { name: string; nights: number; lat?: number; lng?: number };

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void }) => string; reset: (id?: string) => void };
  }
}

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-medium ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"}`;
const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!r.ok || !j) throw new Error(j?.error?.message ?? `요청에 실패했습니다 (${r.status})`);
  return j;
}

/**
 * 고객용 "내 여행 코스 만들기" — 어디·언제 → 누구와·어떻게 → 꼭 갈 곳 → 내 코스(수정·재생·견적·공유).
 * embed면 카페24 쇼핑몰 안(iframe)에 들어가 머리말 없이 보이고, 높이를 쇼핑몰 페이지에 알린다.
 */
export function PlanApp({ embed = false, initial, saved }: { embed?: boolean; initial?: { dest?: string; name?: string; phone?: string }; saved?: { id: string; title: string; request: Omit<PublicPlanRequest, "token">; days: DayPlan[] } }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [step, setStep] = useState(saved ? 4 : 1);
  const [dest, setDest] = useState(saved?.request.destination ?? initial?.dest ?? "");
  const [multi, setMulti] = useState((saved?.request.cities.length ?? 0) > 1);
  const [cities, setCities] = useState<City[]>(saved?.request.cities ?? []);
  const [nights, setNights] = useState(saved?.request.nights ?? 2);
  const [date, setDate] = useState(saved?.request.departureDate ?? "");
  const [arrive, setArrive] = useState(saved?.request.arrive ?? "");
  const [returnDepart, setReturnDepart] = useState(saved?.request.returnDepart ?? "");
  const [travelers, setTravelers] = useState(saved?.request.travelers ?? 2);
  const [companions, setCompanions] = useState<PublicPlanRequest["companions"]>(saved?.request.companions ?? []);
  const [pace, setPace] = useState<PublicPlanRequest["pace"]>(saved?.request.pace ?? "normal");
  const [themes, setThemes] = useState<PublicPlanRequest["themes"]>(saved?.request.themes ?? []);
  const [mustSee, setMustSee] = useState<string[]>(saved?.request.mustSee ?? []);
  const [mustDraft, setMustDraft] = useState("");
  const [rec, setRec] = useState<Recommend>({ courses: [], popular: [] });
  const [token, setToken] = useState("");
  const [state, setState] = useState<{ status: "idle" | "loading" | "error"; message?: string }>({ status: "idle" });
  const [result, setResult] = useState<PublicPlanResult | null>(saved ? { days: saved.days, source: "cache", note: "" } : null);
  const [days, setDays] = useState<DayPlan[]>(saved?.days ?? []);
  const [mapDay, setMapDay] = useState(1);
  const [shareId, setShareId] = useState(saved?.id ?? "");
  const [quote, setQuote] = useState({ open: false, name: initial?.name ?? "", contact: initial?.phone ?? "", requests: "", consent: false, sent: false, error: "" });
  const tsRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const totalNights = multi ? cities.reduce((s, c) => s + c.nights, 0) : nights;
  const destination = multi ? cities.map((c) => c.name).join(", ") : dest.trim();
  const color = config?.company.color || "#4f46e5";

  useEffect(() => {
    fetch("/api/public-plan/config")
      .then((r) => r.json() as Promise<Config>)
      .then(setConfig)
      .catch(() => setConfig({ enabled: true, notice: "", showPrice: false, priceTable: [], turnstileSiteKey: "", company: { name: "", logo: "", color: "", phone: "", email: "" } }));
  }, []);

  // 쇼핑몰 안(iframe)이면 높이를 알린다 (embed.js가 받아 iframe 높이를 맞춘다)
  useEffect(() => {
    if (!embed || typeof window === "undefined" || window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "semitour-plan-height", height: Math.ceil(document.documentElement.scrollHeight) }, "*");
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    send();
    return () => ro.disconnect();
  }, [embed]);

  // 추천 코스·인기 장소
  useEffect(() => {
    const d = (multi ? cities[0]?.name : dest)?.trim();
    if (!d) return;
    const t = window.setTimeout(() => {
      fetch(`/api/public-plan/recommend?dest=${encodeURIComponent(d)}`)
        .then((r) => r.json() as Promise<Recommend>)
        .then(setRec)
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(t);
  }, [dest, multi, cities]);

  // 사람 확인 (Turnstile) — 키가 있을 때만
  useEffect(() => {
    if (step !== 3 || !config?.turnstileSiteKey || !tsRef.current) return;
    const el = tsRef.current;
    const render = () => window.turnstile && el.childElementCount === 0 && window.turnstile.render(el, { sitekey: config.turnstileSiteKey, callback: setToken });
    if (window.turnstile) return void render();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [step, config?.turnstileSiteKey]);

  // 도시 좌표 (도시 사이 교통 비교)
  useEffect(() => {
    const need = cities.filter((c) => c.lat === undefined && c.name.trim().length >= 2);
    if (need.length === 0) return;
    const t = window.setTimeout(async () => {
      const hits = await Promise.all(need.map((c) => fetch(`/api/public-plan/geo?q=${encodeURIComponent(c.name)}`).then((r) => r.json() as Promise<{ hit: { lat: number; lng: number } | null }>).catch(() => ({ hit: null }))));
      setCities((cur) => cur.map((c) => {
        const k = need.findIndex((n) => n.name === c.name);
        return k >= 0 && hits[k].hit ? { ...c, lat: hits[k].hit!.lat, lng: hits[k].hit!.lng } : k >= 0 ? { ...c, lat: NaN } : c;
      }));
    }, 600);
    return () => window.clearTimeout(t);
  }, [cities]);

  const request = (): PublicPlanRequest => ({
    destination: destination || dest,
    cities: multi ? cities.map((c) => ({ name: c.name, nights: c.nights })) : [],
    nights: totalNights,
    days: Math.max(1, totalNights + 1),
    ...(date ? { departureDate: date } : {}),
    travelers,
    companions,
    pace,
    themes,
    mustSee,
    ...(arrive && returnDepart ? { arrive, returnDepart } : {}),
    ...(token ? { token } : {}),
  });

  const make = async () => {
    setState({ status: "loading" });
    try {
      const r = await post<PublicPlanResult>("/api/public-plan", request());
      setResult(r);
      setDays(r.days);
      setMapDay(1);
      setShareId("");
      setStep(4);
      setState({ status: "idle" });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "코스를 만들지 못했습니다." });
      if (window.turnstile) window.turnstile.reset();
      setToken("");
    }
  };

  const save = async () => {
    const { token: _t, ...req } = request();
    void _t;
    const r = await post<{ id: string }>("/api/public-plan/save", { title: `${destination} ${totalNights}박${totalNights + 1}일`, request: req, days });
    setShareId(r.id);
    return r.id;
  };

  const sendQuote = async () => {
    setQuote((q) => ({ ...q, error: "" }));
    try {
      const id = shareId || (await save().catch(() => ""));
      await post("/api/inquiry", {
        name: quote.name,
        contact: quote.contact,
        destination,
        departure: date,
        nights: totalNights,
        travelers,
        budget: 0,
        style: "unsure",
        requests: [quote.requests, companions.length ? `동반: ${companions.map((c) => COMPANION_LABEL[c]).join(", ")}` : "", themes.length ? `관심: ${themes.map((t) => THEME_LABEL[t]).join(", ")}` : ""].filter(Boolean).join(" / ").slice(0, 500),
        website: "",
        consent: quote.consent,
        plan: { title: `${destination} ${totalNights}박${totalNights + 1}일`, ...(id ? { planId: id } : {}), days, cities: multi ? cities.map((c) => ({ name: c.name, nights: c.nights })) : [] },
      });
      setQuote((q) => ({ ...q, sent: true }));
    } catch (e) {
      setQuote((q) => ({ ...q, error: e instanceof Error ? e.message : "보내지 못했습니다." }));
    }
  };

  const summary = useMemo(() => planSummary(days), [days]);
  const price = config ? priceNoteFor(config, destination) : "";
  const popularLeft = rec.popular.map((p) => p.name).filter((n) => !days.some((d) => d.items.some((i) => i.name === n)));
  const cur = days.find((d) => d.day === mapDay) ?? days[0];
  const playback: PlaybackPoint[] = useMemo(() => {
    if (!cur) return [];
    const times = dayTimes(cur);
    let prevEnd = 0;
    return cur.items
      .filter((i) => typeof i.lat === "number" && typeof i.lng === "number")
      .map((i, k) => {
        const t = times.get(i.id) ?? "";
        const m = parseClock(t) ?? 0;
        const ride = k === 0 ? 0 : Math.max(0, m - prevEnd);
        prevEnd = m + i.stayMinutes;
        return { name: i.name, lat: i.lat!, lng: i.lng!, time: t, ride, late: m >= 21 * 60 + 30 };
      });
  }, [cur]);

  if (config && !config.enabled)
    return <p className="mx-auto max-w-md p-8 text-center text-sm text-slate-600">지금은 코스 만들기를 쉬고 있습니다. {config.company.phone && `전화 ${config.company.phone}로 문의해 주세요.`}</p>;

  return (
    <div ref={rootRef} className={`mx-auto w-full max-w-2xl space-y-4 px-4 ${embed ? "py-3" : "py-6"} text-sm text-slate-800`} style={{ ["--brand" as string]: color }}>
      {!embed && (
        <header className="flex items-center gap-2">
          {config?.company.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- 회사 로고 (data URL)
            <img src={config.company.logo} alt="" className="h-8 w-8 rounded object-contain" />
          )}
          <div>
            <p className="text-xs font-semibold" style={{ color }}>{config?.company.name || "여행 코스 만들기"}</p>
            <h1 className="text-lg font-bold text-slate-900">내 여행 코스 만들기</h1>
          </div>
        </header>
      )}
      {config?.notice && <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">{config.notice}</p>}

      <ol className="flex gap-1 text-[11px]" aria-label="단계">
        {["어디·언제", "누구와·어떻게", "꼭 갈 곳", "내 코스"].map((s, i) => (
          <li key={s} className={`flex-1 rounded-full px-2 py-1 text-center font-semibold ${step === i + 1 ? "text-white" : step > i + 1 ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-500"}`} style={step === i + 1 ? { background: color } : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section aria-label="어디·언제" className="space-y-3">
          {!multi ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600">어디로 가세요?</span>
              <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="예) 후쿠오카, 다낭, 오사카" className={field} aria-label="여행지" />
            </label>
          ) : (
            <CityRoute cities={cities} setCities={setCities} />
          )}
          <button
            type="button"
            onClick={() => {
              if (!multi && cities.length === 0 && dest.trim()) setCities([{ name: dest.trim(), nights: Math.max(1, nights) }]);
              setMulti((m) => !m);
            }}
            className="text-xs font-semibold text-indigo-700 underline underline-offset-2"
          >
            {multi ? "도시 하나만 갈래요" : "여러 도시를 돌아요 (도시 루트 짜기)"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">출발일 (선택)</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="출발일" />
            </label>
            {!multi && (
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-600">기간</span>
                <select value={nights} onChange={(e) => setNights(Number(e.target.value))} className={field} aria-label="기간">
                  {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}박 {n + 1}일
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-semibold text-slate-600">항공 시각을 알면 (선택)</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-slate-500">현지 도착</span>
                <input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} className={field} aria-label="현지 도착 시각" />
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">귀국편 출발</span>
                <input type="time" value={returnDepart} onChange={(e) => setReturnDepart(e.target.value)} className={field} aria-label="귀국편 출발 시각" />
              </label>
            </div>
          </details>
          <button type="button" disabled={!destination} onClick={() => setStep(2)} className="w-full rounded-lg py-2.5 font-semibold text-white disabled:bg-slate-300" style={destination ? { background: color } : undefined}>
            다음
          </button>
        </section>
      )}

      {step === 2 && (
        <section aria-label="누구와·어떻게" className="space-y-3">
          <label className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">인원</span>
            <input type="number" min={1} max={50} value={travelers} onChange={(e) => setTravelers(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className={`${field} w-24`} aria-label="인원" />
            <span className="text-xs text-slate-500">명</span>
          </label>
          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold text-slate-600">누구와 가세요?</legend>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(COMPANION_LABEL) as (keyof typeof COMPANION_LABEL)[]).map((c) => (
                <button key={c} type="button" aria-pressed={companions.includes(c)} onClick={() => setCompanions((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))} className={chip(companions.includes(c))}>
                  {COMPANION_LABEL[c]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold text-slate-600">여행 속도</legend>
            <div className="flex gap-1.5">
              {(Object.keys(PACE_LABEL) as (keyof typeof PACE_LABEL)[]).map((p) => (
                <button key={p} type="button" aria-pressed={pace === p} onClick={() => setPace(p)} className={chip(pace === p)}>
                  {PACE_LABEL[p]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold text-slate-600">관심 있는 것</legend>
            <div className="flex flex-wrap gap-1.5">
              {THEME_IDS.map((t) => (
                <button key={t} type="button" aria-pressed={themes.includes(t)} onClick={() => setThemes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))} className={chip(themes.includes(t))}>
                  {THEME_LABEL[t]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-lg border border-slate-300 py-2.5 font-semibold text-slate-700">
              이전
            </button>
            <button type="button" onClick={() => setStep(3)} className="flex-[2] rounded-lg py-2.5 font-semibold text-white" style={{ background: color }}>
              다음
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section aria-label="꼭 갈 곳" className="space-y-3">
          {rec.courses.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-600">추천 코스로 시작하기</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {rec.courses.map((c) => (
                  <button key={c.title} type="button" onClick={() => setMustSee(c.places.slice(0, 10))} className="rounded-lg border border-slate-200 p-2 text-left hover:border-indigo-400">
                    <b className="block text-xs text-slate-900">{c.title}</b>
                    <span className="text-[11px] text-slate-500">{c.places.slice(0, 5).join(" · ")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-600">꼭 가고 싶은 곳 (선택)</p>
            <div className="flex flex-wrap gap-1.5">
              {mustSee.map((m) => (
                <span key={m} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800">
                  {m}
                  <button type="button" aria-label={`${m} 빼기`} onClick={() => setMustSee((cur) => cur.filter((x) => x !== m))}>
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = mustDraft.trim();
                if (v && !mustSee.includes(v) && mustSee.length < 10) setMustSee((cur) => [...cur, v]);
                setMustDraft("");
              }}
              className="flex gap-1.5"
            >
              <input value={mustDraft} onChange={(e) => setMustDraft(e.target.value)} placeholder="장소 이름" className={field} aria-label="꼭 갈 곳" />
              <button type="submit" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700">
                <Plus className="h-3.5 w-3.5" aria-hidden /> 추가
              </button>
            </form>
            {rec.popular.length > 0 && (
              <p className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                다른 고객들이 많이 고른 곳:
                {rec.popular.slice(0, 8).map((p) => (
                  <button key={p.name} type="button" onClick={() => !mustSee.includes(p.name) && mustSee.length < 10 && setMustSee((cur) => [...cur, p.name])} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-700 hover:border-indigo-400">
                    + {p.name}
                    {p.count > 0 && <span className="text-slate-400"> {p.count}</span>}
                  </button>
                ))}
              </p>
            )}
          </div>
          {config?.turnstileSiteKey && <div ref={tsRef} aria-label="사람 확인" />}
          {state.status === "error" && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {state.message}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(2)} className="flex-1 rounded-lg border border-slate-300 py-2.5 font-semibold text-slate-700">
              이전
            </button>
            <button
              type="button"
              onClick={() => void make()}
              disabled={state.status === "loading" || (!!config?.turnstileSiteKey && !token)}
              className="inline-flex flex-[2] items-center justify-center gap-1.5 rounded-lg py-2.5 font-semibold text-white disabled:bg-slate-300"
              style={state.status === "loading" ? undefined : { background: color }}
            >
              {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {state.status === "loading" ? "코스 만드는 중 (30초쯤)…" : "내 코스 만들기"}
            </button>
          </div>
        </section>
      )}

      {step === 4 && result && (
        <section aria-label="내 코스" className="space-y-3">
          <div role="region" aria-label="한눈에 보기" className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
            <p>
              <span className="block text-[10.5px] text-slate-500">항공</span>
              {arrive && returnDepart ? `${arrive} 도착 · ${returnDepart} 출발` : "상담 때 추천"}
            </p>
            <p>
              <span className="block text-[10.5px] text-slate-500">숙소</span>
              {summary.nights.map((n) => `${n.city} ${n.nights}박`).join(" · ") || "-"}
            </p>
            <p>
              <span className="block text-[10.5px] text-slate-500">일정</span>
              관광 {summary.tours}곳 · 식사 {summary.meals}회
            </p>
            <p>
              <span className="block text-[10.5px] text-slate-500">예상 경비</span>
              {price || "견적 받기로 정확히"}
            </p>
          </div>
          {result.note && <p className="text-[11px] text-slate-500">{result.note}</p>}

          {days.some((d) => d.items.some((i) => typeof i.lat === "number")) && (
            <div className="space-y-1.5 rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <MapPin className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
                <b>동선 미리보기</b>
                {days.map((d) => (
                  <button key={d.day} type="button" aria-pressed={mapDay === d.day} onClick={() => setMapDay(d.day)} className={chip(mapDay === d.day)}>
                    DAY {d.day}
                  </button>
                ))}
              </div>
              <PlaybackMap key={mapDay} points={playback} label={`DAY ${mapDay} 동선`} />
            </div>
          )}

          {days.map((d) => {
            const times = dayTimes(d);
            return (
              <article key={d.day} id={`plan-day-${d.day}`} className="space-y-1.5 rounded-xl border border-slate-200 p-3">
                <header className="flex items-center gap-2">
                  <b className="text-slate-900">DAY {d.day}</b>
                  <span className="text-xs text-slate-500">{d.overnightCity}</span>
                  <button type="button" onClick={() => setDays((cur) => lightenDay(cur, d.day))} className="ml-auto text-[11px] font-semibold text-indigo-700 underline underline-offset-2">
                    이 날 가볍게
                  </button>
                </header>
                <ul className="space-y-1">
                  {d.items.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-1 hover:bg-slate-50">
                      <span className="w-11 shrink-0 tabular-nums text-xs text-slate-500">{times.get(i.id) ?? ""}</span>
                      <span className={`flex-1 ${isTourItem(i) ? "font-medium text-slate-900" : "text-slate-600"}`}>
                        {i.name}
                        {isTourItem(i) && i.stayMinutes > 0 && <span className="ml-1 text-[11px] text-slate-400">약 {i.stayMinutes}분</span>}
                      </span>
                      {isTourItem(i) && (
                        <span className="flex items-center gap-1 text-[11px]">
                          <button type="button" onClick={() => setDays((cur) => removeItem(cur, i.id))} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:border-rose-300" aria-label={`${i.name} 빼기`}>
                            빼기
                          </button>
                          {popularLeft.length > 0 && (
                            <button type="button" onClick={() => setDays((cur) => swapItem(cur, i.id, popularLeft[0]))} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:border-indigo-300" aria-label={`${i.name}을 ${popularLeft[0]}(으)로 바꾸기`}>
                              다른 곳으로
                            </button>
                          )}
                          {days.length > 1 && (
                            <select
                              aria-label={`${i.name} 다른 날로 옮기기`}
                              value=""
                              onChange={(e) => e.target.value && setDays((cur) => moveItem(cur, i.id, Number(e.target.value)))}
                              className="rounded border border-slate-200 bg-white px-1 py-0.5 text-slate-600"
                            >
                              <option value="">다른 날로</option>
                              {days.filter((x) => x.day !== d.day).map((x) => (
                                <option key={x.day} value={x.day}>
                                  DAY {x.day}
                                </option>
                              ))}
                            </select>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}

          <div className="sticky bottom-0 flex gap-2 bg-white/95 py-2 backdrop-blur">
            <button type="button" onClick={() => setStep(3)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700">
              다시 만들기
            </button>
            <button
              type="button"
              onClick={async () => {
                const id = shareId || (await save().catch(() => ""));
                if (id) await navigator.clipboard?.writeText(`${window.location.origin}/plan/${id}`).catch(() => undefined);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700"
            >
              {shareId ? "링크 복사됨" : "저장·공유 링크"}
            </button>
            <button type="button" onClick={() => setQuote((q) => ({ ...q, open: true }))} className="flex-1 rounded-lg py-2.5 font-semibold text-white" style={{ background: color }}>
              이 코스로 견적 받기
            </button>
          </div>
          {shareId && (
            <p className="text-[11px] text-slate-500">
              저장했습니다 (180일 보관): <a href={`/plan/${shareId}`} className="text-indigo-700 underline">{`/plan/${shareId}`}</a>
            </p>
          )}

          {quote.open && (
            <section aria-label="견적 받기" className="space-y-2 rounded-xl border-2 border-indigo-200 p-3">
              {quote.sent ? (
                <p role="status" className="text-sm text-emerald-700">
                  견적 요청을 보냈습니다. 담당자가 {quote.contact}(으)로 연락드립니다.
                </p>
              ) : (
                <>
                  <b className="text-slate-900">이 코스로 견적 받기</b>
                  <input value={quote.name} onChange={(e) => setQuote((q) => ({ ...q, name: e.target.value }))} placeholder="이름" className={field} aria-label="이름" />
                  <input value={quote.contact} onChange={(e) => setQuote((q) => ({ ...q, contact: e.target.value }))} placeholder="연락처 (휴대폰·카톡 ID·이메일)" className={field} aria-label="연락처" />
                  <textarea value={quote.requests} onChange={(e) => setQuote((q) => ({ ...q, requests: e.target.value }))} rows={2} placeholder="요청 사항 (선택)" className={field} aria-label="요청 사항" />
                  <label className="flex items-start gap-1.5 text-[11px] text-slate-600">
                    <input type="checkbox" checked={quote.consent} onChange={(e) => setQuote((q) => ({ ...q, consent: e.target.checked }))} className="mt-0.5" />
                    <span>
                      [필수] 견적 상담을 위해 이름·연락처를 수집·이용하는 데 동의합니다. 상담이 끝나면 지우며, 동의하지 않으면 견적을 받을 수 없습니다.
                    </span>
                  </label>
                  {quote.error && (
                    <p role="alert" className="text-xs text-rose-700">
                      {quote.error}
                    </p>
                  )}
                  <button type="button" disabled={!quote.name.trim() || quote.contact.trim().length < 5 || !quote.consent} onClick={() => void sendQuote()} className="w-full rounded-lg py-2.5 font-semibold text-white disabled:bg-slate-300" style={quote.consent ? { background: color } : undefined}>
                    견적 요청 보내기
                  </button>
                </>
              )}
            </section>
          )}
        </section>
      )}
    </div>
  );
}

/** 여러 도시 루트 — 도시 순서·박수, 도시 사이 교통 비교 */
function CityRoute({ cities, setCities }: { cities: City[]; setCities: (f: (c: City[]) => City[]) => void }) {
  const [draft, setDraft] = useState("");
  const move = (i: number, d: -1 | 1) =>
    setCities((cur) => {
      const n = cur.slice();
      const j = i + d;
      if (j < 0 || j >= n.length) return cur;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  return (
    <div aria-label="도시 루트" className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-600">도시 루트 (순서대로)</p>
      {cities.map((c, i) => {
        const next = cities[i + 1];
        const t = next && Number.isFinite(c.lat) && Number.isFinite(next.lat) && c.lat !== undefined && next.lat !== undefined ? transportOptions({ lat: c.lat, lng: c.lng! }, { lat: next.lat, lng: next.lng! }) : null;
        return (
          <div key={`${c.name}-${i}`} className="space-y-1">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5">
              <b className="w-5 text-center text-xs text-indigo-700">{i + 1}</b>
              <span className="flex-1 font-medium">{c.name}</span>
              <button type="button" aria-label={`${c.name} 숙박 줄이기`} onClick={() => setCities((cur) => cur.map((x, k) => (k === i ? { ...x, nights: Math.max(0, x.nights - 1) } : x)))} className="h-7 w-7 rounded border border-slate-300">
                −
              </button>
              <span className="w-10 text-center text-xs tabular-nums">{c.nights}박</span>
              <button type="button" aria-label={`${c.name} 숙박 늘리기`} onClick={() => setCities((cur) => cur.map((x, k) => (k === i ? { ...x, nights: Math.min(14, x.nights + 1) } : x)))} className="h-7 w-7 rounded border border-slate-300">
                +
              </button>
              <button type="button" aria-label={`${c.name} 위로`} onClick={() => move(i, -1)} className="p-1 text-slate-500">
                <ArrowUp className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" aria-label={`${c.name} 아래로`} onClick={() => move(i, 1)} className="p-1 text-slate-500">
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" aria-label={`${c.name} 빼기`} onClick={() => setCities((cur) => cur.filter((_, k) => k !== i))} className="p-1 text-slate-400">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            {next && (
              <p className="pl-7 text-[11px] text-slate-500">
                ↓ {c.name} → {next.name}
                {t ? ` 약 ${t.km}km · ${t.options.map((o) => `${o.label} ${Math.floor(o.minutes / 60) ? `${Math.floor(o.minutes / 60)}시간 ` : ""}${o.minutes % 60}분`).join(" / ")}` : ""}{" "}
                <a href={transitLink(c.name, next.name)} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">
                  대중교통 길찾기
                </a>
              </p>
            )}
          </div>
        );
      })}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (v && cities.length < 8) setCities((cur) => [...cur, { name: v, nights: 1 }]);
          setDraft("");
        }}
        className="flex gap-1.5"
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="도시 추가 (예: 유후인)" className={field} aria-label="도시 추가" />
        <button type="submit" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700">
          <Plus className="h-3.5 w-3.5" aria-hidden /> 추가
        </button>
      </form>
      <p className="text-[11px] text-slate-500">총 {cities.reduce((s, c) => s + c.nights, 0)}박 {cities.reduce((s, c) => s + c.nights, 0) + 1}일 · 이동 시간은 직선거리 어림이며 상담 때 실제 노선으로 확인해 드립니다</p>
    </div>
  );
}
