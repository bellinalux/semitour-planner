"use client";

import { BookMarked, Check, Copy, Download, FileUp, Loader2, Pencil, Printer, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { BASICS_GROUPS, DEFAULT_BASICS, emptyKit, englishFrom, explainMinutes, findScript, LANG_LABEL, scriptIn, scriptKey, scriptQuality, type GuideLang, type BasicsSection, type GuideBasics, type GuideCityEntry, type GuideCityKit, type GuideScript, type Phrase } from "@/lib/guideBook";
import { downloadKit, draftGuide, fetchGuideIndex, fetchKit, patchGuide, scriptAsText } from "@/lib/guideBookClient";
import type { PlaceCard } from "@/lib/knowledge";
import { ScriptEditor } from "./ScriptEditor";
import { ScriptView } from "./ScriptView";

interface Props {
  /** 지금 일정의 도시 (처음 열 때 고른다) */
  defaultCity: string;
  /** 지금 일정의 도시별 장소 이름 — "이 상품 장소" 묶음과 한꺼번에 초안 만들기 */
  tripPlaces: Record<string, string[]>;
  travelers: number;
  buttonClassName?: string;
}

type Tab = "scripts" | "basics" | "phrases";
type Msg = { kind: "ok" | "error"; text: string } | null;

const blankScript = (city: string, name: string): GuideScript => ({
  key: scriptKey(name),
  city,
  name,
  area: "",
  version: 2,
  tier: "standard",
  intro: "",
  points: [{ title: "", hook: "", look: "", text: "", meaning: "", korea: "", question: "", transition: "", more: "" }],
  guideNotes: [],
  veteran: "",
  checks: [],
  site: { dropOff: "", tickets: "", meetPoint: "", restroom: "", photo: "" },
  cautions: [],
  faq: [],
  audience: { family: "", senior: "", student: "", couple: "" },
  viewMin: 30,
  waitMin: 0,
  mustKnow: [],
  sources: [],
  status: "draft",
  updatedAt: "",
  updatedBy: "",
});

/**
 * 가이드 해설집 — 도시별 장소 설명 원고(AI 초안 → 직원 다듬기 → 검수 완료), 초보 가이드 교육 자료(진행 멘트·기본기·비상 대응·상품 원칙),
 * 현지 회화. 회사 공용으로 서버에 저장하고, 파일로 내보내고 불러오고, 도시별 교육 자료로 인쇄한다.
 */
export function GuideBookMenu({ defaultCity, tripPlaces, travelers, buttonClassName }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cities, setCities] = useState<GuideCityEntry[]>([]);
  const [basics, setBasics] = useState<GuideBasics | null>(null);
  const [city, setCity] = useState("");
  const [kit, setKit] = useState<GuideCityKit | null>(null);
  const [places, setPlaces] = useState<PlaceCard[]>([]);
  const [tab, setTab] = useState<Tab>("scripts");
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);
  // 지금 더 깊게 다시 쓰는 지점 (-1 없음)
  const [deepening, setDeepening] = useState(-1);
  // 작업 언어 — 한국어 원고 / 영어 원고 (보기·고치기·검수·인쇄)
  const [lang, setLang] = useState<GuideLang>("ko");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [filter, setFilter] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newPlace, setNewPlace] = useState("");
  // 목록에 없는 장소를 직접 추가했을 때 그 이름
  const [adhoc, setAdhoc] = useState("");

  const tripCities = Object.keys(tripPlaces);
  const allCities = [...new Set([...tripCities, ...cities.map((c) => c.city)])];

  const loadCity = async (c: string) => {
    if (!c.trim()) return;
    setCity(c);
    setSelected("");
    setEditing(false);
    setBusy("load");
    try {
      setKit(await fetchKit(c));
      // 지식 창고 장소 (없으면 빈 목록)
      const r = await fetch(`/api/knowledge?city=${encodeURIComponent(c)}`).catch(() => null);
      const j = r && r.ok ? ((await r.json()) as { doc?: { places?: PlaceCard[] } }) : null;
      setPlaces(Array.isArray(j?.doc?.places) ? j.doc.places : []);
    } catch (e) {
      setKit(emptyKit(c));
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "불러오지 못했습니다." });
    } finally {
      setBusy("");
    }
  };

  const open = async () => {
    dialogRef.current?.showModal();
    setMsg(null);
    try {
      const r = await fetchGuideIndex();
      setCities(r.cities);
      setBasics(r.basics);
      const first = defaultCity || tripCities[0] || r.cities[0]?.city || "";
      if (first) void loadCity(first);
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "불러오지 못했습니다." });
    }
  };

  const refreshIndex = (k: GuideCityKit) =>
    setCities((list) => [{ city: k.city, scripts: k.scripts.length, reviewed: k.scripts.filter((s) => s.status === "reviewed").length, updatedAt: k.updatedAt }, ...list.filter((c) => c.city !== k.city)]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "처리하지 못했습니다." });
    } finally {
      setBusy("");
    }
  };

  const applyKit = (k: GuideCityKit | undefined, text?: string) => {
    if (!k) return;
    setKit(k);
    refreshIndex(k);
    if (text) setMsg({ kind: "ok", text });
  };

  const draft = (name: string, force = false) =>
    run(`draft:${name}`, async () => {
      const r = await draftGuide({ kind: "script", city, name, force });
      applyKit(r.kit, r.kept ? `${name} — 검수 완료된 원고라 그대로 두었습니다 ('AI로 다시 만들기'로 덮을 수 있습니다).` : `${name} 원고 초안을 만들었습니다${r.searched === false ? " (웹 근거를 찾지 못해 검수가 꼭 필요합니다)" : ""}.`);
      setSelected(scriptKey(name));
    });

  const draftAll = (names: string[]) =>
    run("draftAll", async () => {
      let done = 0;
      for (const n of names) {
        setBusy(`draftAll:${done + 1}/${names.length} ${n}`);
        try {
          const r = await draftGuide({ kind: "script", city, name: n });
          applyKit(r.kit);
          done++;
        } catch (e) {
          setMsg({ kind: "error", text: `${n}: ${e instanceof Error ? e.message : "실패"} (${done}곳 완료)` });
          return;
        }
      }
      setMsg({ kind: "ok", text: `원고 초안 ${done}곳을 만들었습니다. 다듬고 검수 완료를 눌러 주세요.` });
    });

  const draftEnglish = (name: string, force = false) =>
    run(`draft:${name} 영어`, async () => {
      const r = await draftGuide({ kind: "english", city, name, force });
      applyKit(r.kit, r.kept ? `${name} — 검수 완료된 영어 원고라 그대로 두었습니다.` : `${name} 영어 원고 초안을 만들었습니다. 다듬고 검수 완료를 눌러 주세요.`);
    });

  const draftEnglishAll = (names: string[]) =>
    run("draftAll", async () => {
      let done = 0;
      for (const n of names) {
        setBusy(`draftAll:${done + 1}/${names.length} ${n} 영어`);
        try {
          applyKit((await draftGuide({ kind: "english", city, name: n })).kit);
          done++;
        } catch (e) {
          setMsg({ kind: "error", text: `${n}: ${e instanceof Error ? e.message : "실패"} (${done}곳 완료)` });
          return;
        }
      }
      setMsg({ kind: "ok", text: `영어 원고 초안 ${done}곳을 만들었습니다. 다듬고 검수 완료를 눌러 주세요.` });
    });

  const deepen = (s: GuideScript, index: number) => {
    setDeepening(index);
    void run(`draft:${s.name} 지점 ${index + 1}`, async () => {
      try {
        applyKit((await draftGuide({ kind: "deepen", city, name: s.name, index })).kit, `${s.name} 지점 ${index + 1}을 더 깊게 다시 썼습니다 (다시 검수해 주세요).`);
      } finally {
        setDeepening(-1);
      }
    });
  };

  /** 예전 방식(포인트 목록)·얕은 원고를 새 방식으로 다시 — 영어 원고가 있던 곳은 영어도 다시 */
  const remakeAll = (list: GuideScript[]) => {
    const reviewed = list.filter((x) => x.status === "reviewed").length;
    if (reviewed > 0 && !window.confirm(`검수 완료된 원고 ${reviewed}곳도 새 방식으로 다시 만듭니다 (지금 원고는 사라지고 초안이 됩니다. 베테랑 메모는 남습니다). 계속할까요?`)) return;
    void run("draftAll", async () => {
      let done = 0;
      for (const x of list) {
        setBusy(`draftAll:${done + 1}/${list.length} ${x.name}`);
        try {
          applyKit((await draftGuide({ kind: "script", city, name: x.name, force: true })).kit);
          if (x.en) applyKit((await draftGuide({ kind: "english", city, name: x.name, force: true })).kit);
          done++;
        } catch (e) {
          setMsg({ kind: "error", text: `${x.name}: ${e instanceof Error ? e.message : "실패"} (${done}곳 완료)` });
          return;
        }
      }
      setMsg({ kind: "ok", text: `${done}곳을 새 방식(지점별 전문 해설)으로 다시 만들었습니다. 확인 필요 표시를 보고 검수해 주세요.` });
    });
  };

  const save = (s: GuideScript, prevKey: string) =>
    run("save", async () => {
      const r = await patchGuide({ action: "save", city, prevKey, script: s });
      applyKit(r.kit, `${s.name} 원고를 저장했습니다.`);
      setSelected(scriptKey(s.name));
      setEditing(false);
    });

  const review = (s: GuideScript, reviewed: boolean) =>
    run("review", async () =>
      applyKit((await patchGuide({ action: "review", city, key: s.key, reviewed, lang })).kit, `${s.name}${lang === "en" ? " 영어 원고" : ""} ${reviewed ? "검수 완료 — 이제 AI 초안이 덮어쓰지 않습니다." : "검수를 풀었습니다."}`),
    );

  const remove = (s: GuideScript) => {
    if (!window.confirm(`${s.name} 원고를 지울까요? 되돌릴 수 없습니다.`)) return;
    void run("remove", async () => {
      applyKit((await patchGuide({ action: "remove", city, key: s.key })).kit, `${s.name} 원고를 지웠습니다.`);
      setSelected("");
    });
  };

  const importFile = (file: File) =>
    run("import", async () => {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("해설집 파일이 아닙니다 (JSON을 읽지 못함).");
      }
      const r = await patchGuide<{ kit: GuideCityKit; added: number; updated: number; skipped: number }>({ action: "import", file: json });
      applyKit(r.kit, `${r.kit.city} 해설집을 불러왔습니다 — 새로 ${r.added}곳 · 바꿈 ${r.updated}곳 · 그대로 ${r.skipped}곳`);
      setCity(r.kit.city);
    });

  const scripts = kit?.scripts ?? [];
  const current = scripts.find((s) => s.key === selected) ?? null;
  const tripNames = tripPlaces[city] ?? [];
  // 일정 이름이 원고 이름을 품고 있으면 그 원고를 쓴다 (예: "왕궁, 에메랄드 사원 관광" → "왕궁")
  const scriptFor = (name: string) => scripts.find((s) => s.key === scriptKey(name)) ?? findScript(scripts, name);
  const missingTrip = tripNames.filter((n) => !scriptFor(n));
  // 예전 방식이거나 기준보다 얕은 원고 (새 방식으로 다시 만들 곳)
  const remakeList = scripts.filter((x) => scriptQuality(x).legacy || scriptQuality(x).shallow);
  // 영어 원고가 없는 이 상품 장소 (한국어 원고가 있는 곳만)
  const missingEn = [...new Map(tripNames.map(scriptFor).filter((s): s is GuideScript => !!s && !s.en).map((s) => [s.key, s.name])).values()];
  const currentEn = current ? scriptIn(current, "en") : null;
  const shownStatus = lang === "en" ? currentEn?.status : current?.status;
  // 목록: 이 상품 장소 → 원고 있는 곳 → 지식 창고 장소 (같은 장소는 한 번만)
  const rows: { name: string; group: string }[] = [];
  const seen = new Set<string>();
  const push = (name: string, group: string) => {
    const k = scriptKey(name);
    if (!k || seen.has(k)) return;
    seen.add(k);
    rows.push({ name, group });
  };
  tripNames.forEach((n) => push(n, "이 상품 장소"));
  scripts.forEach((s) => push(s.name, "원고 있는 곳"));
  places.forEach((p) => push(p.name, "지식 창고 장소"));
  const shown = rows.filter((r) => !filter.trim() || r.name.includes(filter.trim()));
  const pick = (name: string) => {
    setSelected(scriptKey(name));
    setEditing(false);
  };
  const selectedName = current?.name ?? rows.find((r) => scriptKey(r.name) === selected)?.name ?? (scriptKey(adhoc) === selected ? adhoc : "");

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        aria-haspopup="dialog"
        className={buttonClassName ?? "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"}
      >
        <BookMarked className="h-3.5 w-3.5" aria-hidden />
        <span>가이드 해설집</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-label="가이드 해설집"
        className="m-auto h-[90dvh] w-[calc(100%-1.5rem)] max-w-6xl rounded-xl border border-slate-200 bg-white p-0 text-xs text-slate-800 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex h-full flex-col">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
            <BookMarked className="size-4 text-indigo-600" aria-hidden />
            <h2 className="text-sm font-semibold text-slate-900">가이드 해설집</h2>
            <span className="text-[11px] text-slate-500">장소 설명 원고 · 초보 가이드 교육 자료 · 현지 회화 (회사 공용)</span>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="닫기" className="ml-auto rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
            <label className="inline-flex items-center gap-1">
              <span className="font-semibold text-slate-600">도시</span>
              <select value={city} onChange={(e) => void loadCity(e.target.value)} aria-label="도시" className="rounded-md border border-slate-300 bg-white px-2 py-1">
                {!city && <option value="">고르세요</option>}
                {allCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                    {cities.find((x) => x.city === c) ? ` (원고 ${cities.find((x) => x.city === c)!.scripts})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newCity.trim()) void loadCity(newCity.trim());
                setNewCity("");
              }}
              className="inline-flex items-center gap-1"
            >
              <input value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="다른 도시" aria-label="다른 도시 이름" className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1" />
              <button type="submit" className="rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50">
                열기
              </button>
            </form>
            <div role="radiogroup" aria-label="원고 언어" className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
              {(["ko", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={lang === l}
                  onClick={() => {
                    setLang(l);
                    setEditing(false);
                  }}
                  className={`rounded px-2 py-0.5 font-medium ${lang === l ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {LANG_LABEL[l]} 원고
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={!city}
                onClick={() => window.open(`/gb?city=${encodeURIComponent(city)}&lang=${lang}`, "_blank", "noopener")}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-medium hover:bg-slate-50 disabled:opacity-50"
                title="이 도시 장소 원고 전체 + 진행 멘트·기본기·비상 대응 + 현지 회화 (신입 교육 교재)"
              >
                <Printer className="size-3.5" aria-hidden />
                도시 교육 자료 인쇄
              </button>
              <button type="button" disabled={!kit || scripts.length === 0} onClick={() => kit && downloadKit(kit)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-medium hover:bg-slate-50 disabled:opacity-50">
                <Download className="size-3.5" aria-hidden />
                내보내기
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-medium hover:bg-slate-50">
                <FileUp className="size-3.5" aria-hidden />
                불러오기
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                aria-label="해설집 파일 불러오기"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void importFile(f);
                }}
              />
            </div>
          </div>

          <div role="tablist" aria-label="해설집 보기" className="flex gap-1 border-b border-slate-100 px-4 pt-2">
            {(
              [
                ["scripts", `장소 원고 (${scripts.length})`],
                ["basics", "진행 멘트·기본기·비상 대응"],
                ["phrases", `현지 회화 (${kit?.phrases.length ?? 0})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-t-md border-b-2 px-3 py-1.5 font-semibold ${tab === id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {(msg || busy) && (
            <p role="status" className={`px-4 py-1.5 text-[11px] ${msg?.kind === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}>
              {busy && !msg ? (
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  {busy.startsWith("draftAll:") ? `원고 만드는 중 ${busy.slice(9)}` : busy.startsWith("draft:") ? `${busy.slice(6)} 원고 만드는 중 (4갈래 웹 조사·사실 확인 3~5분)` : "처리 중…"}
                </span>
              ) : (
                msg?.text
              )}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            {tab === "scripts" && (
              <div className="grid h-full grid-cols-1 md:grid-cols-[17rem_1fr]">
                <aside aria-label="장소 목록" className="flex min-h-0 flex-col border-b border-slate-100 md:border-b-0 md:border-r">
                  <div className="space-y-1.5 p-3">
                    <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="장소 찾기" aria-label="장소 찾기" className="w-full rounded-md border border-slate-300 px-2 py-1" />
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const n = newPlace.trim();
                        if (!n) return;
                        setNewPlace("");
                        setAdhoc(n);
                        pick(n);
                      }}
                      className="flex gap-1"
                    >
                      <input value={newPlace} onChange={(e) => setNewPlace(e.target.value)} placeholder="장소 직접 추가" aria-label="원고를 쓸 장소 이름" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1" />
                      <button type="submit" className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50">
                        추가
                      </button>
                    </form>
                    {lang === "en" && missingEn.length > 0 && (
                      <button
                        type="button"
                        disabled={busy !== ""}
                        onClick={() => void draftEnglishAll(missingEn)}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        title="한국어 원고가 있는 이 상품 장소 중 영어 원고가 없는 곳을 차례로 만듭니다 (한 곳에 30초 안팎)"
                      >
                        <Sparkles className="size-3.5" aria-hidden />이 상품 장소 영어 원고 모두 만들기 ({missingEn.length}곳)
                      </button>
                    )}
                    {lang === "ko" && remakeList.length > 0 && (
                      <button
                        type="button"
                        disabled={busy !== ""}
                        onClick={() => remakeAll(remakeList)}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        title="예전 방식(포인트 목록)이거나 분량 기준보다 얕은 원고를 지점별 전문 해설로 다시 만듭니다 (한 곳에 3~5분)"
                      >
                        <RefreshCw className="size-3.5" aria-hidden />
                        예전·얕은 원고 새 방식으로 다시 만들기 ({remakeList.length}곳)
                      </button>
                    )}
                    {lang === "ko" && missingTrip.length > 0 && (
                      <button
                        type="button"
                        disabled={busy !== ""}
                        onClick={() => void draftAll(missingTrip)}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        title="이 상품 일정의 장소 중 원고가 없는 곳을 차례로 만듭니다 (한 곳에 3~5분)"
                      >
                        <Sparkles className="size-3.5" aria-hidden />이 상품 장소 원고 모두 만들기 ({missingTrip.length}곳)
                      </button>
                    )}
                  </div>
                  <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                    {shown.length === 0 && <li className="px-2 py-4 text-center text-slate-400">{busy === "load" ? "불러오는 중…" : "장소가 없습니다. 위에서 직접 추가하세요."}</li>}
                    {shown.map((r, i) => {
                      const s = scriptFor(r.name);
                      const head = i === 0 || shown[i - 1].group !== r.group;
                      return (
                        <li key={r.name}>
                          {head && <p className="px-2 pb-1 pt-2 text-[10.5px] font-semibold text-slate-400">{r.group}</p>}
                          <button
                            type="button"
                            onClick={() => pick(s?.name ?? r.name)}
                            aria-current={(s?.key ?? scriptKey(r.name)) === selected}
                            className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left ${(s?.key ?? scriptKey(r.name)) === selected ? "bg-indigo-50 text-indigo-900" : "hover:bg-slate-50"}`}
                          >
                            <span className="min-w-0 flex-1 truncate" title={s && s.key !== scriptKey(r.name) ? `"${s.name}" 원고를 씁니다` : undefined}>
                              {r.name}
                              {s && s.key !== scriptKey(r.name) && <span className="text-slate-400"> → {s.name}</span>}
                            </span>
                            {s ? (
                              <span className={`shrink-0 rounded px-1 text-[10px] font-semibold ring-1 ${s.status === "reviewed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>
                                {s.status === "reviewed" ? "검수 완료" : "초안"} · {explainMinutes(s)}분
                              </span>
                            ) : null}
                            {s && (scriptQuality(s).legacy || scriptQuality(s).shallow) ? (
                              <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900" title={scriptQuality(s).hint}>
                                {scriptQuality(s).legacy ? "예전" : "얕음"}
                              </span>
                            ) : null}
                            {s?.en ? (
                              <span className={`shrink-0 rounded px-1 text-[10px] font-semibold ring-1 ${s.en.status === "reviewed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-sky-50 text-sky-800 ring-sky-200"}`} title={s.en.status === "reviewed" ? "영어 원고 검수 완료" : "영어 원고 초안"}>
                                EN
                              </span>
                            ) : null}
                            {!s && <span className="shrink-0 text-[10px] text-slate-400">원고 없음</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </aside>

                <section aria-label="원고" className="min-h-0 overflow-y-auto p-4">
                  {!selected && <p className="py-10 text-center text-slate-400">왼쪽에서 장소를 고르세요.</p>}
                  {selected && editing && (lang !== "en" || !current) && (
                    <ScriptEditor
                      key={selected}
                      script={current ?? blankScript(city, selectedName || selected)}
                      busy={busy === "save"}
                      onCancel={() => setEditing(false)}
                      onSave={(s) => void save(s, current?.key ?? "")}
                    />
                  )}
                  {selected && editing && lang === "en" && current && (
                    <ScriptEditor
                      key={`${selected}-en`}
                      english
                      script={currentEn ?? { ...blankScript(city, current.name), key: current.key, area: current.area, viewMin: current.viewMin, waitMin: current.waitMin }}
                      busy={busy === "save"}
                      onCancel={() => setEditing(false)}
                      onSave={(v) => void save({ ...current, en: englishFrom(v, current.en?.status ?? "draft", new Date().toISOString(), "") }, current.key)}
                    />
                  )}
                  {selected && !editing && current && lang === "en" && !current.en && (
                    <div className="space-y-3 py-8 text-center">
                      <p className="text-sm font-semibold text-slate-800">{current.name} — 영어 원고가 없습니다</p>
                      <p className="text-slate-500">한국어 원고(사실)를 외국인 손님에게 말하는 자연스러운 영어로 다시 씁니다. 새 사실은 더하지 않습니다.</p>
                      <div className="flex justify-center gap-2">
                        <button type="button" disabled={busy !== ""} onClick={() => void draftEnglish(current.name)} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                          <Sparkles className="size-3.5" aria-hidden />
                          AI로 영어 원고 만들기
                        </button>
                        <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                          직접 쓰기
                        </button>
                      </div>
                    </div>
                  )}
                  {selected && !editing && current && (lang === "ko" || current.en) && (
                    <article className="space-y-3">
                      <header className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{current.name}</h3>
                        {current.area && <span className="text-slate-500">{current.area}</span>}
                        <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ${shownStatus === "reviewed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>
                          {lang === "en" ? "English · " : ""}
                          {shownStatus === "reviewed" ? "검수 완료" : "초안 — 검수 필요"}
                        </span>
                        {(lang === "en" ? currentEn?.updatedAt : current.updatedAt) && (
                          <span className="text-[10.5px] text-slate-400">
                            {new Date((lang === "en" ? currentEn?.updatedAt : current.updatedAt) ?? "").toLocaleDateString("ko-KR")} {(lang === "en" ? currentEn?.updatedBy : current.updatedBy) || "AI 초안"}
                          </span>
                        )}
                        <div className="ml-auto flex flex-wrap gap-1">
                          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50">
                            <Pencil className="size-3.5" aria-hidden />
                            고치기
                          </button>
                          <button
                            type="button"
                            disabled={busy !== ""}
                            onClick={() => void review(current, shownStatus !== "reviewed")}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold disabled:opacity-50 ${shownStatus === "reviewed" ? "border border-slate-300 text-slate-600 hover:bg-slate-50" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                          >
                            <Check className="size-3.5" aria-hidden />
                            {shownStatus === "reviewed" ? "검수 풀기" : "검수 완료"}
                          </button>
                          <button
                            type="button"
                            disabled={busy !== ""}
                            onClick={() => {
                              if (shownStatus === "reviewed" && !window.confirm("검수 완료된 원고를 AI 초안으로 바꿀까요? 지금 원고는 사라집니다.")) return;
                              if (lang === "en") void draftEnglish(current.name, true);
                              else void draft(current.name, true);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <RefreshCw className="size-3.5" aria-hidden />
                            AI로 다시 만들기
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(lang === "en" && currentEn ? scriptAsText(currentEn, "en") : scriptAsText(current));
                              setMsg({ kind: "ok", text: `${current.name} 원고를 복사했습니다.` });
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
                          >
                            <Copy className="size-3.5" aria-hidden />
                            복사
                          </button>
                          <button type="button" onClick={() => remove(current)} aria-label={`${current.name} 원고 지우기`} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </header>
                      <ScriptView key={lang} script={current} travelers={travelers} defaultLang={lang} onDeepen={busy === "" ? (i) => deepen(current, i) : undefined} deepening={deepening} />
                    </article>
                  )}
                  {selected && !editing && !current && (
                    <div className="space-y-3 py-8 text-center">
                      <p className="text-sm font-semibold text-slate-800">{selectedName} — 원고가 없습니다</p>
                      <p className="text-slate-500">AI가 웹에서 역사·볼거리·현장 진행·주의 사항을 찾아 초안을 씁니다. 다듬은 뒤 검수 완료를 누르세요.</p>
                      <div className="flex justify-center gap-2">
                        <button type="button" disabled={busy !== "" || !city} onClick={() => void draft(selectedName)} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                          <Sparkles className="size-3.5" aria-hidden />
                          AI로 초안 만들기
                        </button>
                        <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                          직접 쓰기
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            {tab === "basics" && basics && (
              <BasicsPanel
                basics={basics}
                busy={busy === "basics"}
                onSave={(sections) =>
                  void run("basics", async () => {
                    const r = await patchGuide<{ basics: GuideBasics }>({ action: "basics", basics: { sections } });
                    setBasics(r.basics);
                    setMsg({ kind: "ok", text: "교육 자료를 저장했습니다." });
                  })
                }
              />
            )}

            {tab === "phrases" && (
              <PhrasesPanel
                city={city}
                phrases={kit?.phrases ?? []}
                busy={busy}
                onDraft={() =>
                  void run("phrases", async () => {
                    const r = await draftGuide({ kind: "phrases", city });
                    applyKit(r.kit, `${city} 현지 회화(${r.language ?? ""})를 만들었습니다. 발음·표기를 한 번 확인해 주세요.`);
                  })
                }
                onSave={(phrases) => void run("phrases", async () => applyKit((await patchGuide({ action: "phrases", city, phrases })).kit, "현지 회화를 저장했습니다."))}
              />
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

/** 진행 멘트·기본기·비상 대응·상품 원칙 — 회사 공용 교육 자료 (한 줄에 하나) */
function BasicsPanel({ basics, busy, onSave }: { basics: GuideBasics; busy: boolean; onSave: (sections: BasicsSection[]) => void }) {
  const [draft, setDraft] = useState<BasicsSection[] | null>(null);
  const sections = draft ?? basics.sections;
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-slate-500">초보 가이드 교육용 — 회사에 맞게 고쳐 쓰세요. 상품 가이드 해설집·도시 교육 자료 인쇄에 함께 들어갑니다.</p>
        {basics.updatedAt && <span className="text-[10.5px] text-slate-400">{new Date(basics.updatedAt).toLocaleDateString("ko-KR")} {basics.updatedBy}</span>}
        <div className="ml-auto flex gap-1.5">
          {draft ? (
            <>
              <button type="button" onClick={() => setDraft(DEFAULT_BASICS)} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">
                기본 자료로 되돌리기
              </button>
              <button type="button" onClick={() => setDraft(null)} className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50">
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onSave(draft);
                  setDraft(null);
                }}
                className="rounded-md bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                저장
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setDraft(basics.sections)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50">
              <Pencil className="size-3.5" aria-hidden />
              고치기
            </button>
          )}
        </div>
      </div>
      {BASICS_GROUPS.map((g) => (
        <section key={g} className="mb-4">
          <h3 className="mb-1.5 text-[11px] font-semibold text-indigo-700">{g}</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {sections
              .filter((s) => s.group === g)
              .map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-200 p-3">
                  <h4 className="mb-1 font-semibold text-slate-900">{s.title}</h4>
                  {draft ? (
                    <textarea
                      aria-label={`${s.title} 내용`}
                      value={s.lines.join("\n")}
                      rows={Math.max(3, s.lines.length + 1)}
                      onChange={(e) => setDraft(sections.map((x) => (x.id === s.id ? { ...x, lines: e.target.value.split("\n").slice(0, 20) } : x)))}
                      className="w-full rounded-md border border-slate-300 px-2 py-1"
                    />
                  ) : (
                    <ul className="list-disc space-y-0.5 pl-4 leading-5">
                      {s.lines.filter((l) => l.trim()).map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** 현지 회화 — AI로 만들고, 한 줄에 "한국어 | 현지어 | 발음"으로 고친다 */
function PhrasesPanel({ city, phrases, busy, onDraft, onSave }: { city: string; phrases: Phrase[]; busy: string; onDraft: () => void; onSave: (p: Phrase[]) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-slate-500">{city ? `${city} — 가이드·손님이 자주 쓰는 표현` : "도시를 고르세요"}</p>
        <div className="ml-auto flex gap-1.5">
          <button type="button" disabled={!city || busy !== ""} onClick={onDraft} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50">
            <Sparkles className="size-3.5" aria-hidden />
            {phrases.length ? "AI로 다시 만들기" : "AI로 만들기"}
          </button>
          {text === null ? (
            <button type="button" disabled={!city} onClick={() => setText(phrases.map((p) => `${p.ko} | ${p.local} | ${p.say}`).join("\n"))} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50">
              <Pencil className="size-3.5" aria-hidden />
              고치기
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onSave(
                  text
                    .split("\n")
                    .map((l) => l.split("|").map((x) => x.trim()))
                    .filter((p) => p[0] && p[1])
                    .slice(0, 60)
                    .map(([ko, local, say]) => ({ ko: ko.slice(0, 80), local: local.slice(0, 120), say: (say ?? "").slice(0, 120) })),
                );
                setText(null);
              }}
              className="rounded-md bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-700"
            >
              저장
            </button>
          )}
        </div>
      </div>
      {text !== null ? (
        <textarea aria-label="현지 회화 (한국어 | 현지어 | 발음)" value={text} onChange={(e) => setText(e.target.value)} rows={20} className="w-full rounded-md border border-slate-300 px-2 py-1 font-mono" />
      ) : phrases.length === 0 ? (
        <p className="py-10 text-center text-slate-400">아직 없습니다. AI로 만들기를 누르세요.</p>
      ) : (
        <table className="w-full max-w-2xl">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 font-medium">한국어</th>
              <th className="py-1 font-medium">현지어</th>
              <th className="py-1 font-medium">발음</th>
            </tr>
          </thead>
          <tbody>
            {phrases.map((p) => (
              <tr key={`${p.ko}-${p.local}`} className="border-b border-slate-100">
                <td className="py-1">{p.ko}</td>
                <td className="py-1">{p.local}</td>
                <td className="py-1 text-slate-600">{p.say}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
