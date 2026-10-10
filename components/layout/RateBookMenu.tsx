"use client";

import { ReceiptText, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { ageText, hotelScore, latest, type CityRates, type RateObs } from "@/lib/rateBook";

interface CityEntry {
  city: string;
  hotels: number;
  ground: number;
  updatedAt: string;
}

const money = (v: number, currency: string) => `${Math.round(v).toLocaleString("ko-KR")} ${currency}`;
const range = (r: RateObs) => (r.low && r.low !== r.high ? `${money(r.low, r.currency).replace(` ${r.currency}`, "")}~${money(r.high, r.currency)}` : money(r.high, r.currency));
const age = (iso: string) => ageText(Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

function RateCell({ r, tone }: { r: RateObs | undefined; tone: string }) {
  if (!r) return <span className="text-slate-300">—</span>;
  return (
    <span className={tone}>
      {range(r)}
      <span className="block text-[10.5px] text-slate-400">
        {age(r.at)} · {r.by}
        {r.month ? ` · ${r.month}월` : ""}
      </span>
    </span>
  );
}

/**
 * 회사 요금표 — 업체 견적가(실제 거래가)와 웹 시세를 호텔·차량·가이드별로 본다.
 * 견적은 업체 견적가(6개월·같은 시즌) → 웹 시세(30일) 순서로 이 표를 먼저 쓰고, 없을 때만 새로 찾는다.
 */
export function RateBookMenu({ defaultCity }: { defaultCity: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [cities, setCities] = useState<CityEntry[] | null>(null);
  const [doc, setDoc] = useState<CityRates | null>(null);
  const [message, setMessage] = useState("");
  const [newCity, setNewCity] = useState("");
  const [form, setForm] = useState({ kind: "hotel" as "hotel" | "vehicle" | "guide", name: "", amount: 0, currency: "KRW", month: 0, by: "" });

  const load = async (city: string) => {
    const r = await fetch(`/api/rates?city=${encodeURIComponent(city)}`);
    if (r.ok) setDoc(((await r.json()) as { doc: CityRates }).doc);
  };
  const open = async () => {
    dialogRef.current?.showModal();
    setMessage("");
    try {
      const r = await fetch("/api/rates");
      const list = r.ok ? ((await r.json()) as { cities: CityEntry[] }).cities : [];
      setCities(list);
      const first = list.find((c) => c.city === defaultCity)?.city ?? list[0]?.city;
      if (first) void load(first);
    } catch {
      setCities([]);
    }
  };
  const remove = async (body: Record<string, string | number>, ok: string, city = doc?.city) => {
    if (!city) return;
    const r = await fetch("/api/rates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, ...body }) });
    if (r.ok) {
      const next = ((await r.json()) as { doc: CityRates }).doc;
      setDoc(next);
      setCities((list) => [{ city: next.city, hotels: next.hotels.length, ground: next.ground.length, updatedAt: next.updatedAt }, ...(list ?? []).filter((c) => c.city !== next.city)]);
      setMessage(ok);
    } else setMessage("저장하지 못했습니다. 값을 확인해 주세요.");
  };
  const addRate = () => {
    const city = newCity.trim() || doc?.city || defaultCity;
    if (!city || !form.name.trim() || !(form.amount > 0)) return;
    void remove({ action: "addRate", kind: form.kind, name: form.name.trim(), amount: form.amount, currency: form.currency, month: form.month, by: form.by.trim() || "직접 입력" }, `${city} ${form.name.trim()} 요금을 넣었습니다 (업체 견적가로 기록).`, city);
    setForm({ ...form, name: "", amount: 0 });
  };

  const hotels = doc ? [...doc.hotels].sort((a, b) => hotelScore(b) - hotelScore(a)) : [];
  return (
    <>
      <button type="button" onClick={() => void open()} aria-haspopup="dialog" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
        <ReceiptText className="h-4 w-4" aria-hidden />
        <span>요금표</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="ratebook-title"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-5xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[90dvh] flex-col text-xs">
          <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 id="ratebook-title" className="text-sm font-semibold text-slate-900">
                요금표
              </h2>
              <p className="text-[11px] text-slate-500">업체 견적가(6개월·같은 시즌) → 웹 시세(30일) 순서로 견적에 먼저 씁니다. 업체 견적서를 올리거나 호텔·시세를 찾으면 저절로 쌓입니다.</p>
            </div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>
          <div className="space-y-3 overflow-y-auto p-4">
            <div role="radiogroup" aria-label="요금표 도시" className="flex flex-wrap gap-1.5">
              {(cities ?? []).map((c) => (
                <button
                  key={c.city}
                  type="button"
                  role="radio"
                  aria-checked={doc?.city === c.city}
                  onClick={() => void load(c.city)}
                  className={`rounded-full border px-2.5 py-1 ${doc?.city === c.city ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  {c.city} <span className="opacity-70">호텔 {c.hotels}</span>
                </button>
              ))}
            </div>
            {cities !== null && cities.length === 0 && <p className="text-slate-500">아직 요금이 없습니다. 업체 견적서를 올리거나 호텔 찾기·자동 견적을 하면 쌓이고, 아래에서 계약 요금을 직접 넣을 수도 있습니다.</p>}
            <fieldset className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 p-2">
              <legend className="sr-only">계약 요금 직접 넣기</legend>
              <span className="font-semibold text-slate-700">계약 요금 직접 넣기</span>
              <input aria-label="요금 도시" value={newCity} onChange={(e) => setNewCity(e.target.value.slice(0, 40))} placeholder={doc?.city || defaultCity || "도시"} className="w-20 rounded border border-slate-300 px-1.5 py-0.5" />
              <select aria-label="요금 종류" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })} className="rounded border border-slate-300 bg-white px-1 py-0.5">
                <option value="hotel">호텔 1실 1박</option>
                <option value="vehicle">차량 1일</option>
                <option value="guide">가이드 1일</option>
              </select>
              <input aria-label="호텔·차종 이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 100) })} placeholder={form.kind === "hotel" ? "호텔 이름" : form.kind === "vehicle" ? "차종 (예: 16인승)" : "가이드 (예: 한국어)"} className="w-32 rounded border border-slate-300 px-1.5 py-0.5" />
              <input aria-label="요금" type="number" min={0} value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Math.max(0, Number(e.target.value) || 0) })} placeholder="요금" className="w-24 rounded border border-slate-300 px-1.5 py-0.5 text-right" />
              <input aria-label="통화" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) })} className="w-14 rounded border border-slate-300 px-1.5 py-0.5" />
              <select aria-label="시즌 (달)" value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })} className="rounded border border-slate-300 bg-white px-1 py-0.5">
                <option value={0}>달 구분 없음</option>
                {Array.from({ length: 12 }, (_, k) => k + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
              <input aria-label="업체" value={form.by} onChange={(e) => setForm({ ...form, by: e.target.value.slice(0, 60) })} placeholder="업체" className="w-24 rounded border border-slate-300 px-1.5 py-0.5" />
              <button type="button" disabled={!form.name.trim() || !(form.amount > 0)} onClick={addRate} className="rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                넣기
              </button>
            </fieldset>
            {message && (
              <p role="status" className="text-emerald-700">
                {message}
              </p>
            )}
            {doc && (
              <>
                <section aria-label="호텔 요금" className="space-y-1">
                  <p className="font-semibold text-slate-800">호텔 ({hotels.length}) — 한국인 이용·국내 여행사 패키지·업체 견적가 순으로 먼저 고릅니다</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500">
                          <th className="py-1 pr-2 font-medium">호텔</th>
                          <th className="py-1 pr-2 font-medium">한국인 · 여행사</th>
                          <th className="py-1 pr-2 font-medium">확인</th>
                          <th className="py-1 pr-2 font-medium">업체 견적가 (1실 1박)</th>
                          <th className="py-1 pr-2 font-medium">웹 시세</th>
                          <th className="py-1 font-medium">
                            <span className="sr-only">지우기</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 align-top tabular-nums">
                        {hotels.map((h) => (
                          <tr key={h.key}>
                            <td className="py-1 pr-2">
                              <b className="text-slate-800">{h.name}</b>
                              <span className="block text-[10.5px] text-slate-400">{[h.grade, h.area].filter(Boolean).join(" · ")}</span>
                            </td>
                            <td className="py-1 pr-2 text-pretty">
                              {h.korean ? <span className="text-emerald-700">한국인 이용</span> : <span className="text-slate-400">—</span>}
                              {h.agencies.length > 0 && <span className="block text-[10.5px] text-indigo-700">{h.agencies.join(", ")}</span>}
                            </td>
                            <td className="py-1 pr-2 text-pretty">
                              {h.check ? (
                                <span className={h.check.exists ? "text-emerald-700" : "text-rose-700"}>
                                  {h.check.exists ? "실재 확인" : "확인 못함"}
                                  {h.check.note && <span className="block text-[10.5px] text-amber-800">{h.check.note}</span>}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="py-1 pr-2">
                              <RateCell r={latest(h.rates, "supplier")} tone="font-semibold text-slate-800" />
                            </td>
                            <td className="py-1 pr-2">
                              <RateCell r={latest(h.rates, "web")} tone="text-slate-700" />
                            </td>
                            <td className="py-1">
                              <button type="button" aria-label={`${h.name} 지우기`} onClick={() => void remove({ action: "removeHotel", key: h.key }, `${h.name}을(를) 지웠습니다.`)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section aria-label="차량·가이드 요금" className="space-y-1">
                  <p className="font-semibold text-slate-800">차량 · 가이드 (1일)</p>
                  {doc.ground.length === 0 ? (
                    <p className="text-slate-500">아직 없습니다. 업체 견적서에 차량·가이드 1일 요금이 있거나 자동 견적을 하면 쌓입니다.</p>
                  ) : (
                    <table className="w-full tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500">
                          <th className="py-1 pr-2 font-medium">종류</th>
                          <th className="py-1 pr-2 font-medium">업체 견적가</th>
                          <th className="py-1 pr-2 font-medium">웹 시세</th>
                          <th className="py-1 font-medium">
                            <span className="sr-only">지우기</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 align-top">
                        {doc.ground.map((g) => (
                          <tr key={g.key}>
                            <td className="py-1 pr-2">
                              <b>{g.kind === "vehicle" ? "차량" : "가이드"}</b> {g.label}
                            </td>
                            <td className="py-1 pr-2">
                              <RateCell r={latest(g.rates, "supplier")} tone="font-semibold text-slate-800" />
                            </td>
                            <td className="py-1 pr-2">
                              <RateCell r={latest(g.rates, "web")} tone="text-slate-700" />
                            </td>
                            <td className="py-1">
                              <button type="button" aria-label={`${g.label} 지우기`} onClick={() => void remove({ action: "removeGround", key: g.key }, `${g.label}을(를) 지웠습니다.`)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              </>
            )}
            <p className="text-[10.5px] text-slate-400">업체 실제 요금이 들어 있어 회사(접근 코드) 안에서만 씁니다.</p>
          </div>
        </div>
      </dialog>
    </>
  );
}
