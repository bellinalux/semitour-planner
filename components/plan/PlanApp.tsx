"use client";

import { ArrowDown, ArrowUp, Loader2, MapPin, Plus, Sparkles, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { PlaybackMap, type PlaybackPoint } from "@/components/plan/PlaybackMap";
import { parseClock } from "@/lib/dayLoad";
import { dayTimes, isTourItem, lightenDay, moveItem, planSummary, removeItem, swapItem, transitLink, transportOptions } from "@/lib/planEdit";
import { COMPANION_LABEL, DEFAULT_STYLE, isSelfGuided, PACE_LABEL, priceNoteFor, SERVICE_IDS, SERVICE_LABEL, STYLE_IDS, STYLES, THEME_IDS, THEME_LABEL, type MustSpot, type PublicPlanRequest, type PublicPlanResult, type ServiceId, type TravelStyle } from "@/lib/publicPlan";
import { dayLegs, hotelAreas, passAdvice } from "@/lib/selfGuide";
import { AskUs } from "./AskUs";
import { MustSee } from "./MustSee";
import type { DayPlan, ItineraryItem } from "@/types";

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

const STAGES = ["인기 장소 찾는 중…", "동선·영업시간 맞추는 중…", "식사·이동 시간 정리하는 중…", "거의 다 됐어요…"];

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-medium ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"}`;
const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

async function post<T>(url: string, body: unknown, timeoutMs = 30_000): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new Error(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "시간이 오래 걸려 멈췄습니다. 조금 뒤 다시 시도하시거나 견적 요청을 남겨 주세요." : "인터넷 연결을 확인해 주세요.");
  }
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [stage, setStage] = useState(0);
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
  const [style, setStyleRaw] = useState<TravelStyle>(saved?.request.style ?? DEFAULT_STYLE);
  const [services, setServices] = useState<ServiceId[]>(saved?.request.services ?? STYLES[saved?.request.style ?? DEFAULT_STYLE].services);
  /** 자유여행 + 투어: 가이드 투어로 바꾼 날 */
  const [tourDays, setTourDays] = useState<number[]>([]);
  const [contact, setContact] = useState({ how: "카카오톡", when: "" });
  /** 여행 방식을 바꾸면 우리가 해 드릴 것을 그 방식의 기본으로 */
  const setStyle = (s2: TravelStyle) => {
    setStyleRaw(s2);
    setServices(STYLES[s2].services);
  };
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
    if (!config?.turnstileSiteKey || !tsRef.current) return;
    const el = tsRef.current;
    const render = () => window.turnstile && el.childElementCount === 0 && window.turnstile.render(el, { sitekey: config.turnstileSiteKey, callback: setToken });
    if (window.turnstile) return void render();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [config?.turnstileSiteKey]);

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

  // 만드는 동안 진행 상태 (지식 창고 → 동선 → 시간 정리)
  useEffect(() => {
    if (state.status !== "loading") return;
    setStage(0);
    const t = window.setInterval(() => setStage((n) => Math.min(STAGES.length - 1, n + 1)), 4000);
    return () => window.clearInterval(t);
  }, [state.status]);

  const canMake = state.status !== "loading" && (!config?.turnstileSiteKey || !!token);

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
    style,
    services,
    ...(arrive && returnDepart ? { arrive, returnDepart } : {}),
    ...(token ? { token } : {}),
  });

  /** 코스 만들기 — 결과 화면의 칩·추천 코스는 바뀐 조건(override)으로 바로 다시 만든다 */
  const make = async (override: Partial<Pick<PublicPlanRequest, "companions" | "pace" | "themes" | "mustSee" | "style" | "services">> = {}) => {
    setState({ status: "loading" });
    try {
      const r = await post<PublicPlanResult>("/api/public-plan", { ...request(), ...override }, 90_000);
      setResult(r);
      setDays(r.days);
      setMapDay(1);
      setShareId("");
      setTourDays([]);
      setState({ status: "idle" });
      window.setTimeout(() => document.getElementById("plan-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "코스를 만들지 못했습니다." });
    } finally {
      // 사람 확인 토큰은 한 번만 쓸 수 있다 — 다음 만들기를 위해 새로 받는다
      if (config?.turnstileSiteKey && window.turnstile) {
        window.turnstile.reset();
        setToken("");
      }
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
        style: style === "package" ? "package" : style === "semi" ? "semi" : "free",
        requests: [quote.requests, `여행 방식: ${STYLES[style].label}`, services.length ? `맡길 것: ${services.map((x) => SERVICE_LABEL[x]).join(", ")}` : "", tourDays.length ? `가이드 투어 날: ${tourDays.map((d) => `DAY ${d}`).join(", ")}` : "", `연락: ${contact.how}${contact.when ? ` (${contact.when})` : ""}`, companions.length ? `동반: ${companions.map((c) => COMPANION_LABEL[c]).join(", ")}` : "", themes.length ? `관심: ${themes.map((t) => THEME_LABEL[t]).join(", ")}` : ""].filter(Boolean).join(" / ").slice(0, 500),
        website: "",
        consent: quote.consent,
        plan: { title: `${destination} ${totalNights}박${totalNights + 1}일 · ${STYLES[style].label}`, ...(id ? { planId: id } : {}), days, cities: multi ? cities.map((c) => ({ name: c.name, nights: c.nights })) : [], style, services, tourDays },
      });
      setQuote((q) => ({ ...q, sent: true }));
    } catch (e) {
      setQuote((q) => ({ ...q, error: e instanceof Error ? e.message : "보내지 못했습니다." }));
    }
  };

  /** 우리에게 요청하기 — 항목별 견적/예약 요청 (코스는 선택해서 함께) */
  const sendAsk: Parameters<typeof AskUs>[0]["send"] = async (b) => {
    const id = b.withPlan ? shareId || (await save().catch(() => "")) : "";
    await post("/api/inquiry", {
      name: b.name,
      contact: b.contact,
      destination,
      departure: date,
      nights: totalNights,
      travelers,
      budget: 0,
      style: style === "package" ? "package" : style === "semi" ? "semi" : "free",
      requests: [b.requests, `여행 방식: ${STYLES[style].label}`].filter(Boolean).join(" / ").slice(0, 500),
      website: "",
      consent: b.consent,
      asks: b.asks,
      ...(b.withPlan && days.length ? { plan: { title: `${destination} ${totalNights}박${totalNights + 1}일 · ${STYLES[style].label}`, ...(id ? { planId: id } : {}), days, cities: multi ? cities.map((c) => ({ name: c.name, nights: c.nights })) : [], style, services, tourDays } } : {}),
    });
  };

  /** 꼭 가볼 곳 [코스에 넣기] — 코스 전이면 "꼭 갈 곳"에, 코스가 있으면 가장 한가한 날(호텔·항공 앞)에 */
  const addSpot = (sp: MustSpot) => {
    if (days.length === 0) {
      if (!mustSee.includes(sp.name) && mustSee.length < 10) setMustSee((cur) => [...cur, sp.name]);
      return;
    }
    setDays((cur) => {
      const load = (d: DayPlan) => d.items.filter((i) => !["flight", "hotel", "transfer"].includes(i.type ?? "")).reduce((n, i) => n + i.stayMinutes, 0);
      const target = cur.slice().sort((a, b) => load(a) - load(b))[0];
      return cur.map((d) => {
        if (d.day !== target.day) return d;
        let at = d.items.length;
        while (at > 0 && ["hotel", "flight", "transfer"].includes(d.items[at - 1].type ?? "")) at--;
        const items = d.items.slice();
        const type: ItineraryItem["type"] = sp.kind === "shopping" ? "shopping" : sp.kind === "activity" || sp.kind === "night" ? "experience" : "sightseeing";
        items.splice(at, 0, { id: `spot-${Date.now()}`, type, name: sp.name, description: sp.why, stayMinutes: sp.stayMin, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: true, ...(sp.lat != null && sp.lng != null ? { lat: sp.lat, lng: sp.lng } : {}) });
        return { ...d, items };
      });
    });
  };

  const summary = useMemo(() => planSummary(days), [days]);
  const price = config ? priceNoteFor(config, destination, style) : "";
  const selfGuided = isSelfGuided(style);
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
      <nav aria-label="바로가기" className="flex flex-wrap gap-1.5 text-xs print:hidden">
        <a href="#plan-ask" className="rounded-full px-3 py-1.5 font-semibold text-white" style={{ background: color }}>
          🧾 우리에게 요청하기 (항공권·호텔·유심 등)
        </a>
      </nav>

      <section aria-label="코스 조건" className="space-y-3 rounded-xl border border-slate-200 p-3 print:hidden">
        <fieldset aria-label="여행 방식" className="space-y-1">
          <legend className="text-xs font-semibold text-slate-600">어떻게 여행하세요?</legend>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_IDS.map((id) => (
              <button key={id} type="button" aria-pressed={style === id} onClick={() => setStyle(id)} className={chip(style === id)}>
                {STYLES[id].icon} {STYLES[id].label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">{STYLES[style].desc}</p>
        </fieldset>
        <div className="flex flex-wrap items-end gap-2">
          {!multi ? (
            <label className="min-w-0 flex-[2] space-y-1">
              <span className="text-xs font-semibold text-slate-600">어디로 가세요?</span>
              <input
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && destination && canMake) void make();
                }}
                placeholder="예) 후쿠오카, 다낭, 오사카"
                className={field}
                aria-label="여행지"
              />
            </label>
          ) : (
            <div className="w-full">
              <CityRoute cities={cities} setCities={setCities} />
            </div>
          )}
          {!multi && (
            <label className="flex-1 space-y-1">
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
        {config?.turnstileSiteKey && <div ref={tsRef} aria-label="사람 확인" />}
        <button
          type="button"
          onClick={() => void make()}
          disabled={!destination || !canMake}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-3 text-base font-semibold text-white disabled:bg-slate-300"
          style={destination && canMake ? { background: color } : undefined}
        >
          {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {state.status === "loading" ? STAGES[stage] : result ? "이 조건으로 다시 만들기" : "바로 코스 만들기"}
        </button>
        {state.status === "error" && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {state.message}{" "}
            <a href={`/q${config?.company.name ? `?c=${encodeURIComponent(config.company.name)}` : ""}`} className="font-semibold underline">
              견적 요청 남기기
            </a>
          </p>
        )}

        <details className="text-xs" open={moreOpen} onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer font-semibold text-indigo-700">더 맞추고 싶으면 (선택) — 맡길 것(항공·호텔·유심·보험 등) · 누구와 · 속도 · 관심 · 꼭 갈 곳 · 항공 시각 · 여러 도시</summary>
          <div className="mt-3 space-y-3">
            <button
              type="button"
              onClick={() => {
                if (!multi && cities.length === 0 && dest.trim()) setCities([{ name: dest.trim(), nights: Math.max(1, nights) }]);
                setMulti((m) => !m);
              }}
              className="font-semibold text-indigo-700 underline underline-offset-2"
            >
              {multi ? "도시 하나만 갈래요" : "여러 도시를 돌아요 (도시 루트 짜기)"}
            </button>
            <fieldset aria-label="우리가 해 드릴 것" className="space-y-1">
              <legend className="font-semibold text-slate-600">우리가 해 드릴 것 (견적 범위)</legend>
              <div className="flex flex-wrap gap-1.5">
                {SERVICE_IDS.map((x) => (
                  <label key={x} className={`${chip(services.includes(x))} cursor-pointer`}>
                    <input type="checkbox" className="sr-only" checked={services.includes(x)} onChange={() => setServices((cur) => (cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x]))} />
                    {services.includes(x) ? "✓ " : ""}
                    {SERVICE_LABEL[x]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="font-semibold text-slate-600">출발일</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="출발일" />
              </label>
              <label className="space-y-1">
                <span className="font-semibold text-slate-600">인원</span>
                <input type="number" min={1} max={50} value={travelers} onChange={(e) => setTravelers(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className={field} aria-label="인원" />
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">현지 도착 (항공)</span>
                <input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} className={field} aria-label="현지 도착 시각" />
              </label>
              <label className="space-y-1">
                <span className="text-slate-500">귀국편 출발</span>
                <input type="time" value={returnDepart} onChange={(e) => setReturnDepart(e.target.value)} className={field} aria-label="귀국편 출발 시각" />
              </label>
            </div>
            <Chips label="누구와 가세요?" all={Object.keys(COMPANION_LABEL) as (keyof typeof COMPANION_LABEL)[]} names={COMPANION_LABEL} on={companions} toggle={(c) => setCompanions((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))} />
            <Chips label="여행 속도" all={Object.keys(PACE_LABEL) as (keyof typeof PACE_LABEL)[]} names={PACE_LABEL} on={[pace]} toggle={(p) => setPace(p)} />
            <Chips label="관심 있는 것" all={[...THEME_IDS]} names={THEME_LABEL} on={themes} toggle={(t) => setThemes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))} />
            <div className="space-y-1.5">
              <p className="font-semibold text-slate-600">꼭 가고 싶은 곳</p>
              <div className="flex flex-wrap gap-1.5">
                {mustSee.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-800">
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
                <button type="submit" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 font-semibold text-slate-700">
                  <Plus className="h-3.5 w-3.5" aria-hidden /> 추가
                </button>
              </form>
            </div>
          </div>
        </details>
      </section>

      {(rec.courses.length > 0 || rec.popular.length > 0) && (
        <section aria-label="추천" className="space-y-1.5 text-xs">
          {rec.courses.length > 0 && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {rec.courses.slice(0, 4).map((c) => (
                <button key={c.title} type="button" disabled={!canMake} onClick={() => { setMustSee(c.places.slice(0, 10)); void make({ mustSee: c.places.slice(0, 10) }); }} className="rounded-lg border border-slate-200 p-2 text-left hover:border-indigo-400 disabled:opacity-60">
                  <b className="block text-slate-900">추천 코스로 바로 만들기 · {c.title}</b>
                  <span className="text-[11px] text-slate-500">{c.places.slice(0, 5).join(" · ")}</span>
                </button>
              ))}
            </div>
          )}
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
        </section>
      )}

      <MustSee city={multi ? (cities[0]?.name ?? "") : dest} guided={!selfGuided} isIn={(n) => mustSee.includes(n) || days.some((d) => d.items.some((i) => i.name === n))} onAdd={addSpot} />

      {result && (
        <section id="plan-result" aria-label="내 코스" className="scroll-mt-4 space-y-3">
          <div aria-label="조건 바꿔 다시 만들기" className="flex flex-wrap items-center gap-1 text-[11px]">
            <span className="text-slate-500">조건 바꿔 바로 다시:</span>
            {(Object.keys(COMPANION_LABEL) as (keyof typeof COMPANION_LABEL)[]).filter((c) => c !== "infant" && c !== "group").map((c) => (
              <button key={c} type="button" disabled={!canMake} aria-pressed={companions.includes(c)} onClick={() => { const next = companions.includes(c) ? companions.filter((x) => x !== c) : [...companions, c]; setCompanions(next); void make({ companions: next }); }} className={chip(companions.includes(c))}>
                {COMPANION_LABEL[c]}
              </button>
            ))}
            {(Object.keys(PACE_LABEL) as (keyof typeof PACE_LABEL)[]).map((p) => (
              <button key={p} type="button" disabled={!canMake} aria-pressed={pace === p} onClick={() => { setPace(p); void make({ pace: p }); }} className={chip(pace === p)}>
                {PACE_LABEL[p]}
              </button>
            ))}
            {THEME_IDS.slice(0, 4).map((t) => (
              <button key={t} type="button" disabled={!canMake} aria-pressed={themes.includes(t)} onClick={() => { const next = themes.includes(t) ? themes.filter((x) => x !== t) : [...themes, t]; setThemes(next); void make({ themes: next }); }} className={chip(themes.includes(t))}>
                {THEME_LABEL[t]}
              </button>
            ))}
          </div>
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
          <p className="flex flex-wrap items-center gap-1 text-[11px]">
            <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: color }}>
              {STYLES[style].icon} {STYLES[style].label}
            </span>
            {services.map((x) => (
              <span key={x} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                {SERVICE_LABEL[x]}
              </span>
            ))}
            {tourDays.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">가이드 투어 {tourDays.length}일</span>}
          </p>
          {travelers >= 8 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{travelers}명이면 단체 견적으로 더 저렴할 수 있어요 — 견적을 요청하시면 단체 요금으로 안내해 드립니다.</p>}
          {selfGuided && (
            <section aria-label="자유여행 준비" className="space-y-1 rounded-xl bg-sky-50 p-3 text-xs text-slate-700">
              <b className="text-slate-900">자유여행 안내</b>
              <p>🚇 교통: {passAdvice(destination)}</p>
              {hotelAreas(days).map((h) => (
                <p key={h.city}>
                  🏨 {h.city} 숙소는 <b>{h.near}</b> 주변이 이동이 가장 짧습니다
                </p>
              ))}
              {services.includes("esim") && <p>📶 eSIM·유심: 휴대폰이 eSIM을 지원하는지 먼저 확인하세요 (안 되면 유심·포켓와이파이로 준비해 드립니다)</p>}
              {services.includes("insurance") && <p>🛡 여행자보험: 출발 전까지 가입을 도와 드립니다</p>}
              <p className="text-[11px] text-slate-500">이동 시간·요금은 어림값이에요. 장소마다 [길찾기]로 실제 노선을 확인하세요.</p>
              <button type="button" onClick={() => window.print()} className="mt-1 rounded-md border border-sky-300 bg-white px-2.5 py-1 font-semibold text-sky-800">
                안내서 인쇄·PDF 저장
              </button>
            </section>
          )}

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
                  {tourDays.includes(d.day) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">가이드 투어</span>}
                  <span className="ml-auto flex items-center gap-2">
                    {style === "free_tour" && (
                      <button type="button" aria-pressed={tourDays.includes(d.day)} onClick={() => setTourDays((cur) => (cur.includes(d.day) ? cur.filter((x) => x !== d.day) : [...cur, d.day].sort((a, b) => a - b)))} className="text-[11px] font-semibold text-amber-700 underline underline-offset-2">
                        {tourDays.includes(d.day) ? "셀프로 되돌리기" : "이 날 가이드 투어로"}
                      </button>
                    )}
                    {style === "free_tour" && !d.items.some((i) => /야경 투어/.test(i.name)) && (
                      <button
                        type="button"
                        onClick={() =>
                          setDays((cur) =>
                            cur.map((x) => {
                              if (x.day !== d.day) return x;
                              let at = x.items.length;
                              while (at > 0 && ["hotel", "flight", "transfer"].includes(x.items[at - 1].type ?? "")) at--;
                              const items = x.items.slice();
                              items.splice(at, 0, { id: `night-${d.day}`, type: "experience", name: "야경 투어 (선택 · 약 2시간)", description: "", stayMinutes: 120, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: true });
                              return { ...x, items };
                            }),
                          )
                        }
                        className="text-[11px] font-semibold text-indigo-700 underline underline-offset-2"
                      >
                        + 야경 투어
                      </button>
                    )}
                    <button type="button" onClick={() => setDays((cur) => lightenDay(cur, d.day))} className="text-[11px] font-semibold text-indigo-700 underline underline-offset-2">
                      이 날 가볍게
                    </button>
                  </span>
                </header>
                <ul className="space-y-1">
                  {d.items.map((i) => {
                    // 모든 방식에서 다음 장소까지 이동 — 셀프는 도보·대중교통 + 길찾기, 가이드(패키지·세미·투어 날)는 전용차량
                    const dayGuided = !selfGuided || tourDays.includes(d.day);
                    const leg = dayLegs(d, dayGuided).find((l) => l.from.id === i.id);
                    return (
                    <Fragment key={i.id}>
                    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-1 hover:bg-slate-50">
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
                    {leg && (
                      <li className="pl-12 text-[11px] text-sky-800">
                        ↓ {leg.hint.text}
                        {!dayGuided && (
                          <>
                            {" "}
                            <a href={leg.hint.link} target="_blank" rel="noopener noreferrer" className="underline">
                              길찾기
                            </a>
                          </>
                        )}
                      </li>
                    )}
                    </Fragment>
                    );
                  })}
                </ul>
              </article>
            );
          })}

          <div className="sticky bottom-0 flex gap-2 bg-white/95 py-2 backdrop-blur">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(true);
                rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700"
            >
              조건 바꾸기
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
                  <div className="grid grid-cols-2 gap-2">
                    <select value={contact.how} onChange={(e) => setContact((c) => ({ ...c, how: e.target.value }))} className={field} aria-label="연락 방법">
                      {["카카오톡", "전화", "문자", "이메일"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <input value={contact.when} onChange={(e) => setContact((c) => ({ ...c, when: e.target.value }))} placeholder="연락 가능 시간 (예: 평일 저녁)" className={field} aria-label="연락 가능 시간" />
                  </div>
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

      <AskUs
        ctx={{ destination, date, nights: totalNights, travelers, hotelArea: hotelAreas(days)[0]?.near ? `${hotelAreas(days)[0].near} 주변` : "", suggested: STYLES[style].services }}
        hasPlan={days.length > 0}
        initial={{ name: initial?.name ?? "", phone: initial?.phone ?? "" }}
        color={color}
        send={sendAsk}
      />
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

/** 칩 고르기 (누구와·속도·관심) */
function Chips<K extends string>({ label, all, names, on, toggle }: { label: string; all: K[]; names: Record<K, string>; on: K[]; toggle: (k: K) => void }) {
  return (
    <fieldset className="space-y-1">
      <legend className="font-semibold text-slate-600">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {all.map((k) => (
          <button key={k} type="button" aria-pressed={on.includes(k)} onClick={() => toggle(k)} className={chip(on.includes(k))}>
            {names[k]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
