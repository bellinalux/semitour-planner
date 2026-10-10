"use client";

import { BookOpenCheck, Loader2, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { postJson } from "@/lib/api";
import { COMPANIONS } from "@/lib/defaults";
import { bestStay, placeScore, reasonFor, type CityKnowledge } from "@/lib/knowledge";
import { metricsRows, type MetricsRecord, type MetricsRow } from "@/lib/knowledgeMetrics";
import type { CityIndexEntry } from "@/lib/server/knowledgeStore";
import type { TravelType, TripScope } from "@/types";

interface Props {
  /** 지금 일정의 도시 (처음 열 때 고른다) */
  defaultCity: string;
  travelType: TravelType;
  tripScope: TripScope;
  buttonClassName?: string;
}

type Tab = "review" | "places" | "courses" | "needs" | "notes";
const SEG: Record<string, string> = { general: "여행자 공통", ...Object.fromEntries(COMPANIONS.map((c) => [c.id, c.label])) };
const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" }) : "—");

async function patch(body: unknown): Promise<{ doc?: CityKnowledge; cities?: CityIndexEntry[] }> {
  const r = await fetch("/api/knowledge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { doc?: CityKnowledge; cities?: CityIndexEntry[]; error?: { message?: string } };
  if (!r.ok) throw new Error(j.error?.message ?? "저장하지 못했습니다.");
  return j;
}

/**
 * 지식 창고 — 도시별로 쌓인 장소(인기·여행사·우리 고객·현장 실측)·인기 코스·여행자 니즈·현장 기록을 보고 고친다.
 * 직원이 확인(잠금)한 장소는 웹 조사가 내용을 덮어쓰지 않는다. 후기 원문은 저장하지 않고 요약·출처만 둔다.
 */
export function KnowledgeMenu({ defaultCity, travelType, tripScope, buttonClassName }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [cities, setCities] = useState<CityIndexEntry[] | null>(null);
  const [city, setCity] = useState("");
  const [doc, setDoc] = useState<CityKnowledge | null>(null);
  const [tab, setTab] = useState<Tab>("places");
  const [busy, setBusy] = useState<"" | "load" | "research">("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [newCity, setNewCity] = useState("");
  const [add, setAdd] = useState({ name: "", area: "", stay: 0 });
  const [metrics, setMetrics] = useState<MetricsRow[] | null>(null);

  const loadCity = async (c: string) => {
    if (!c.trim()) return;
    setCity(c);
    setBusy("load");
    try {
      const r = await fetch(`/api/knowledge?city=${encodeURIComponent(c)}`);
      const j = (await r.json()) as { doc?: CityKnowledge; error?: { message?: string } };
      if (!r.ok) throw new Error(j.error?.message ?? "불러오지 못했습니다.");
      setDoc(j.doc ?? null);
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "불러오지 못했습니다." });
    } finally {
      setBusy("");
    }
  };

  const open = async () => {
    dialogRef.current?.showModal();
    setMessage(null);
    void fetch("/api/knowledge?metrics=1")
      .then((r) => (r.ok ? (r.json() as Promise<{ metrics: MetricsRecord }>) : { metrics: {} }))
      .then((j) => setMetrics(metricsRows(j.metrics)))
      .catch(() => setMetrics(null));
    try {
      const r = await fetch("/api/knowledge");
      const j = (await r.json()) as { cities?: CityIndexEntry[] };
      const list = j.cities ?? [];
      setCities(list);
      const first = defaultCity || list[0]?.city || "";
      if (first) void loadCity(first);
    } catch {
      setCities([]);
    }
  };

  const research = async (c: string) => {
    if (!c.trim()) return;
    setBusy("research");
    setMessage(null);
    try {
      const r = await postJson<{ doc: CityKnowledge; researched: boolean }>("/api/knowledge/research", { city: c.trim(), travelType, tripScope, force: true });
      setCity(r.doc.city);
      setDoc(r.doc);
      setCities((list) => [{ city: r.doc.city, places: r.doc.places.length, courses: r.doc.courses.length, researchedAt: r.doc.researchedAt, learnedCount: r.doc.learnedCount, updatedAt: r.doc.updatedAt }, ...(list ?? []).filter((x) => x.city !== r.doc.city)]);
      setMessage({ kind: "ok", text: `${r.doc.city} 조사를 지식 창고에 합쳤습니다 (장소 ${r.doc.places.length}곳).` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "조사하지 못했습니다." });
    } finally {
      setBusy("");
    }
  };

  const act = async (body: Record<string, unknown>, ok: string) => {
    try {
      const r = await patch({ city, ...body });
      if (r.doc) setDoc(r.doc);
      if (r.cities) {
        setCities(r.cities);
        setDoc(null);
        setCity("");
      }
      setMessage({ kind: "ok", text: ok });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "저장하지 못했습니다." });
      void loadCity(city);
    }
  };

  const ranked = doc ? [...doc.places].sort((a, b) => placeScore(b) - placeScore(a)) : [];
  const shown = ranked.filter((p) => !filter.trim() || `${p.name} ${p.area}`.includes(filter.trim()));
  const totals = (cities ?? []).reduce((s, c) => ({ places: s.places + c.places, learned: s.learned + c.learnedCount }), { places: 0, learned: 0 });
  const sources = doc ? [...new Map(doc.places.flatMap((p) => p.sources).map((s) => [s.url, s])).values()].slice(0, 8) : [];

  return (
    <>
      <button type="button" onClick={() => void open()} aria-haspopup="dialog" className={buttonClassName ?? "flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"}>
        <BookOpenCheck className="h-4 w-4" aria-hidden />
        <span>지식 창고</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="knowledge-title"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-5xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[90dvh] flex-col text-xs">
          <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 id="knowledge-title" className="text-sm font-semibold text-slate-900">
                지식 창고
              </h2>
              <p className="text-[11px] text-slate-500">
                도시 {cities?.length ?? 0}곳 · 장소 {totals.places}곳 · 우리 자료로 배운 횟수 {totals.learned}번 — 코스를 만들 때 이 창고를 먼저 봅니다
              </p>
            </div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>
          <div className="space-y-3 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="도시">
              {(cities ?? []).map((c) => (
                <button
                  key={c.city}
                  type="button"
                  role="radio"
                  aria-checked={city === c.city}
                  onClick={() => void loadCity(c.city)}
                  className={`rounded-full border px-2.5 py-1 ${city === c.city ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  {c.city} <span className="opacity-70">{c.places}곳</span>
                </button>
              ))}
              <span className="ml-auto inline-flex items-center gap-1">
                <input aria-label="조사할 도시" value={newCity} onChange={(e) => setNewCity(e.target.value.slice(0, 40))} placeholder="도시 이름" className="w-28 rounded-md border border-slate-300 px-2 py-1" />
                <button type="button" disabled={busy !== "" || !(newCity.trim() || city)} onClick={() => void research(newCity.trim() || city)} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {busy === "research" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  웹에서 (다시) 조사
                </button>
              </span>
            </div>
            {metrics && metrics.some((m) => m.research + m.reuse + m.learned > 0 || m.score !== null) && (
              <details open className="rounded-md border border-slate-200 p-2.5">
                <summary className="cursor-pointer font-semibold text-slate-800">발전 지표 (최근 6개월)</summary>
                <p className="mt-1 text-pretty text-[11px] text-slate-500">
                  재사용이 늘면 웹 조사(AI 호출 2번·약 2분)를 아낀 것이고, 직원이 뺀 비율이 줄고 코스 점검 점수가 오르면 코스가 좋아지고 있는 것입니다.
                </p>
                <div className="overflow-x-auto">
                  <table aria-label="발전 지표" className="mt-1 w-full min-w-[520px] tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-0.5 pr-2 font-medium">달</th>
                        <th className="py-0.5 pr-2 text-right font-medium">웹 조사</th>
                        <th className="py-0.5 pr-2 text-right font-medium">지식 재사용 (조사 절약)</th>
                        <th className="py-0.5 pr-2 text-right font-medium">우리 자료로 배운 것</th>
                        <th className="py-0.5 pr-2 text-right font-medium">AI 장소 중 직원이 뺀 비율</th>
                        <th className="py-0.5 text-right font-medium">코스 점검 평균</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m) => (
                        <tr key={m.month} className="border-b border-slate-100">
                          <td className="py-0.5 pr-2">{m.month}</td>
                          <td className="py-0.5 pr-2 text-right">{m.research}</td>
                          <td className="py-0.5 pr-2 text-right">{m.reuse}</td>
                          <td className="py-0.5 pr-2 text-right">{m.learned}</td>
                          <td className="py-0.5 pr-2 text-right">{m.removedRate === null ? "—" : `${m.removedRate}%`}</td>
                          <td className="py-0.5 text-right">{m.score === null ? "—" : `${m.score}점`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {busy === "research" && <p className="text-slate-500">여행 후기·다른 여행사 상품·여행자 유형별 니즈를 웹에서 조사합니다 (1~2분).</p>}
            {message && (
              <p role="status" className={message.kind === "ok" ? "text-emerald-700" : "text-red-600"}>
                {message.text}
              </p>
            )}

            {busy === "load" && <p className="text-slate-400">불러오는 중…</p>}
            {cities !== null && cities.length === 0 && !doc && <p className="text-slate-500">아직 쌓인 지식이 없습니다. 코스를 만들면 그 도시를 자동으로 조사해 쌓고, 위에서 도시를 적어 직접 조사할 수도 있습니다.</p>}

            {doc && (
              <section aria-label={`${doc.city} 지식`} className="space-y-2">
                <p className="text-[11px] text-slate-500">
                  {doc.city} · 웹 조사 {doc.researchCount}번 (마지막 {date(doc.researchedAt)}) · 우리 자료로 배운 횟수 {doc.learnedCount}번 · 장소 {doc.places.length} · 인기 코스 {doc.courses.length}
                </p>
                <div role="tablist" aria-label="지식 종류" className="flex flex-wrap gap-1">
                  {(
                    [
                      ...(doc.places.some((p) => p.pending) ? [["review", `검수 대기 ${doc.places.filter((p) => p.pending).length}`] as [Tab, string]] : []),
                      ["places", `장소 ${doc.places.length}`],
                      ["courses", `인기 코스 ${doc.courses.length}`],
                      ["needs", `여행자 니즈 ${doc.needs.length}`],
                      ["notes", `현장 기록 ${doc.fieldNotes.length}`],
                    ] as [Tab, string][]
                  ).map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-3 py-1 font-medium ${tab === id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {tab === "places" && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input aria-label="장소 찾기" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="장소 찾기" className="w-36 rounded-md border border-slate-300 px-2 py-1" />
                      <span className="ml-auto inline-flex flex-wrap items-center gap-1">
                        <input aria-label="추가할 장소" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value.slice(0, 80) })} placeholder="장소 직접 추가" className="w-32 rounded-md border border-slate-300 px-2 py-1" />
                        <input aria-label="추가할 장소 지역" value={add.area} onChange={(e) => setAdd({ ...add, area: e.target.value.slice(0, 40) })} placeholder="지역" className="w-20 rounded-md border border-slate-300 px-2 py-1" />
                        <input aria-label="추가할 장소 체류(분)" type="number" min={0} value={add.stay || ""} onChange={(e) => setAdd({ ...add, stay: Math.max(0, Math.round(Number(e.target.value) || 0)) })} placeholder="체류(분)" className="w-20 rounded-md border border-slate-300 px-2 py-1" />
                        <button
                          type="button"
                          disabled={!add.name.trim()}
                          onClick={() => {
                            void act({ action: "add", name: add.name.trim(), area: add.area.trim(), stayWeb: add.stay }, `${add.name.trim()}을(를) 추가했습니다 (직원 확인).`);
                            setAdd({ name: "", area: "", stay: 0 });
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          추가
                        </button>
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table aria-label="장소 목록" className="w-full min-w-[760px]">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-slate-500">
                            <th className="py-1 pr-2 font-medium">순위</th>
                            <th className="py-1 pr-2 font-medium">장소</th>
                            <th className="py-1 pr-2 text-right font-medium">점수</th>
                            <th className="py-1 pr-2 font-medium">근거</th>
                            <th className="py-1 pr-2 font-medium">체류</th>
                            <th className="py-1 pr-2 font-medium">좋은 점 · 주의</th>
                            <th className="py-1 font-medium">확인 · 지우기</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 align-top">
                          {shown.slice(0, 150).map((p) => {
                            const rank = ranked.indexOf(p);
                            return (
                              <tr key={p.key}>
                                <td className="py-1 pr-2 tabular-nums text-slate-500">{rank + 1}</td>
                                <td className="py-1 pr-2">
                                  <b className="text-slate-800">{p.name}</b>
                                  {p.pending && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">검수 대기</span>}
                                  {p.area && <span className="block text-[10.5px] text-slate-400">{p.area}</span>}
                                  {p.fits.length > 0 && <span className="block text-[10.5px] text-indigo-600">{p.fits.map((f) => SEG[f] ?? f).join(" · ")}</span>}
                                </td>
                                <td className={`py-1 pr-2 text-right tabular-nums font-semibold ${placeScore(p) < 0 ? "text-rose-600" : "text-slate-800"}`}>{placeScore(p)}</td>
                                <td className="py-1 pr-2 text-pretty text-slate-600">{reasonFor(p, rank) || "—"}</td>
                                <td className="py-1 pr-2 tabular-nums">
                                  <input
                                    type="number"
                                    min={0}
                                    aria-label={`${p.name} 체류(분)`}
                                    defaultValue={p.stayWeb || ""}
                                    onBlur={(e) => {
                                      const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                                      if (v !== p.stayWeb) void act({ action: "edit", key: p.key, patch: { stayWeb: v } }, `${p.name} 체류를 ${v}분으로 고쳤습니다.`);
                                    }}
                                    className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right"
                                  />
                                  분{p.stayField && <span className="block text-[10.5px] text-emerald-700">현장 {p.stayField.avg}분 ({p.stayField.n}번)</span>}
                                  {bestStay(p) > 0 && bestStay(p) !== p.stayWeb && <span className="block text-[10.5px] text-slate-400">코스에 쓰는 값 {bestStay(p)}분</span>}
                                </td>
                                <td className="py-1 pr-2 text-pretty">
                                  {p.likes.slice(0, 2).map((l) => (
                                    <span key={l} className="block text-emerald-800">
                                      + {l}
                                    </span>
                                  ))}
                                  {[...p.dislikes.slice(0, 2), ...p.fieldNotes.slice(0, 1)].map((l) => (
                                    <span key={l} className="block text-amber-800">
                                      − {l}
                                    </span>
                                  ))}
                                </td>
                                <td className="py-1">
                                  <span className="flex items-center gap-1.5">
                                    <label className="inline-flex items-center gap-1">
                                      <input
                                        type="checkbox"
                                        checked={p.verified}
                                        onChange={(e) => {
                                          const v = e.target.checked;
                                          // 바로 보이게 하고 저장 (실패하면 서버 값으로 돌아온다)
                                          setDoc((d) => (d ? { ...d, places: d.places.map((x) => (x.key === p.key ? { ...x, verified: v } : x)) } : d));
                                          void act({ action: "verify", key: p.key, verified: v }, v ? `${p.name} — 직원 확인 (조사가 덮어쓰지 않습니다)` : `${p.name} — 확인 해제`);
                                        }}
                                      />
                                      확인
                                    </label>
                                    <button
                                      type="button"
                                      aria-label={`${p.name} 지우기`}
                                      onClick={() => {
                                        if (window.confirm(`${p.name}을(를) 지식 창고에서 지울까요?`)) void act({ action: "remove", key: p.key }, `${p.name}을(를) 지웠습니다.`);
                                      }}
                                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10.5px] text-slate-400">점수 = 후기 인기(40%) + 다른 여행사 포함 + 우리 고객이 고른 좋았던 곳/아쉬운 곳 + 성약 − 직원이 뺀 횟수 + 직원 확인. 우리 자료가 쌓일수록 웹 인기보다 무거워집니다.</p>
                  </div>
                )}

                {tab === "review" && (
                  <div className="space-y-2">
                    <p className="text-pretty text-slate-600">웹 조사로 새로 들어온 곳입니다. 코스에는 쓰지만 점수를 조금 낮춰 둡니다. 맞으면 [그대로 쓰기], 확실하면 [확인](잠금), 틀리면 지우세요.</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => void act({ action: "review", all: true }, "검수 대기를 모두 그대로 쓰기로 했습니다.")} className="rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700">
                        모두 그대로 쓰기
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("검수 대기 중인 곳을 모두 지울까요?")) void act({ action: "rejectPending" }, "검수 대기 중인 곳을 지웠습니다.");
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        모두 지우기
                      </button>
                    </div>
                    <ul aria-label="검수 대기" className="divide-y divide-slate-100">
                      {ranked
                        .filter((p) => p.pending)
                        .map((p) => (
                          <li key={p.key} className="flex flex-wrap items-start gap-2 py-1.5">
                            <span className="min-w-0 flex-1 text-pretty">
                              <b className="text-slate-800">{p.name}</b>
                              {p.area && <span className="text-slate-400"> · {p.area}</span>}
                              <span className="block text-[10.5px] text-slate-500">
                                인기 {p.popularity}
                                {p.agencies.length ? ` · ${p.agencies.join(", ")}` : ""}
                                {p.likes[0] ? ` · + ${p.likes[0]}` : ""}
                                {p.dislikes[0] ? ` · − ${p.dislikes[0]}` : ""}
                              </span>
                              {p.sources[0] && (
                                <a href={p.sources[0].url} target="_blank" rel="noopener noreferrer" className="text-[10.5px] text-indigo-600 hover:underline">
                                  출처: {p.sources[0].title || p.sources[0].url}
                                </a>
                              )}
                            </span>
                            <span className="flex shrink-0 gap-1">
                              <button type="button" onClick={() => void act({ action: "review", key: p.key }, `${p.name} — 그대로 씁니다.`)} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50">
                                그대로 쓰기
                              </button>
                              <button type="button" onClick={() => void act({ action: "verify", key: p.key, verified: true }, `${p.name} — 직원 확인 (조사가 덮어쓰지 않습니다)`)} className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 hover:bg-emerald-100">
                                확인
                              </button>
                              <button type="button" aria-label={`${p.name} 지우기`} onClick={() => void act({ action: "remove", key: p.key }, `${p.name}을(를) 지웠습니다.`)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {tab === "courses" && (
                  <ul className="space-y-1.5">
                    {doc.courses.length === 0 && <li className="text-slate-500">아직 인기 코스가 없습니다.</li>}
                    {doc.courses.map((c) => (
                      <li key={c.key} className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-pretty">
                          <b className="text-slate-800">{c.name}</b> <span className="text-slate-500">{c.places.join(" → ")}</span>
                          <span className="block text-[10.5px] text-slate-400">
                            {c.agencies.length > 0 ? `${c.agencies.join(", ")} · ` : ""}
                            {c.note}
                          </span>
                        </span>
                        <button type="button" aria-label={`${c.name} 지우기`} onClick={() => void act({ action: "removeCourse", key: c.key }, `${c.name}을(를) 지웠습니다.`)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {tab === "needs" && (
                  <ul className="space-y-1.5">
                    {doc.needs.length === 0 && <li className="text-slate-500">아직 여행자 니즈 조사가 없습니다.</li>}
                    {doc.needs.map((n) => (
                      <li key={n.segment} className="text-pretty">
                        <b className="text-slate-800">{SEG[n.segment] ?? n.segment}</b> — 좋아함: {n.likes.join(", ") || "—"} / 피함: {n.avoid.join(", ") || "—"}
                        {n.tips.length > 0 && <span className="block text-slate-500">챙길 것: {n.tips.join(", ")}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                {tab === "notes" && (
                  <ul className="space-y-1">
                    {doc.fieldNotes.length === 0 && <li className="text-slate-500">가이드 링크의 현장 기록을 [지식 창고에 반영]하면 여기에 쌓입니다.</li>}
                    {doc.fieldNotes.map((n, i) => (
                      <li key={`${n.at}-${i}`}>
                        <span className="text-slate-400">{date(n.at)}</span> {n.day ? `DAY ${n.day} ` : ""}
                        <b>[{n.type}]</b> {n.text}
                      </li>
                    ))}
                  </ul>
                )}

                {sources.length > 0 && (
                  <details className="rounded-md p-2 ring-1 ring-slate-200">
                    <summary className="cursor-pointer text-[11px] font-medium text-slate-600">참고한 출처 ({sources.length})</summary>
                    <ul className="mt-1 space-y-0.5">
                      {sources.map((s) => (
                        <li key={s.url}>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-600 hover:underline">
                            {s.title || s.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`${doc.city} 지식을 모두 지울까요? 되돌릴 수 없습니다.`)) void act({ action: "deleteCity" }, `${doc.city} 지식을 지웠습니다.`);
                    }}
                    className="text-[11px] text-slate-400 underline hover:text-rose-600"
                  >
                    이 도시 지식 모두 지우기
                  </button>
                </div>
              </section>
            )}
            <p className="text-[10.5px] text-slate-400">후기 원문은 저장하지 않고 짧은 요약·숫자·출처 링크만 둡니다. 고객 이름·연락처는 넣지 않습니다. 회사(접근 코드) 안에서만 공유됩니다.</p>
          </div>
        </div>
      </dialog>
    </>
  );
}
