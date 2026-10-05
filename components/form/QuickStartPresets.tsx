"use client";

/**
 * 간단 입력 마법사 — 지역을 잘 몰라도 테마 카드 하나로 여행 유형·테마·요청을 한 번에 채운다.
 * + 인기 투어 동선 보기: 그 지역에서 잘 팔리는 투어의 필수 장소·대표 동선·운영 팁(/api/engine/patterns)을 보고 요청 메모에 넣는다.
 */
import { Loader2, Route, Wand2 } from "lucide-react";
import { useState } from "react";
import type { ThemeId, TravelType, TripInput } from "@/types";

interface Preset { id: string; label: string; hint: string; travelType: TravelType; themes: ThemeId[]; notes: string }

const PRESETS: Preset[] = [
  { id: "first", label: "첫 방문 핵심", hint: "꼭 가야 할 대표 명소 위주", travelType: "semi", themes: ["history", "photo"], notes: "처음 방문하는 고객 — 대표 명소를 빠짐없이, 동선은 짧게. 예약 필요한 곳은 시간 지정 입장으로." },
  { id: "photo", label: "사진·풍경", hint: "인생샷 명소·일몰 포인트", travelType: "semi", themes: ["photo", "nature"], notes: "사진 명소 위주 — 빛이 좋은 시간대(오전·일몰)에 맞춰 배치, 일몰 포인트 1곳 포함." },
  { id: "food", label: "미식·로컬", hint: "시장·맛집·현지 체험", travelType: "semi", themes: ["food", "local"], notes: "현지 시장(오전 운영 확인)·대표 음식 체험, 점심은 현지식 맛집, 쇼핑은 짧게." },
  { id: "slow", label: "느긋하게(시니어)", hint: "하루 3~4곳·쉬는 시간 충분", travelType: "senior", themes: ["history", "nature"], notes: "시니어 고객 — 하루 3~4곳, 도보 15분 이내, 2시간마다 휴식, 계단·경사 적은 동선, 일정은 18시 전 종료." },
  { id: "family", label: "가족·아이", hint: "체험·공원·짧은 이동", travelType: "package", themes: ["activity", "nature"], notes: "아이 동반 가족 — 체험형 장소, 화장실·휴식 공간 확인, 이동은 짧게, 점심은 11:30 이른 시간." },
  { id: "romance", label: "커플·허니문", hint: "로맨틱 스팟·야경", travelType: "honeymoon", themes: ["photo", "food"], notes: "커플 — 로맨틱한 명소, 일몰·야경 포인트, 분위기 좋은 레스토랑 1곳." },
];

export function QuickStartPresets({ input, onChange }: { input: TripInput; onChange: (patch: Partial<TripInput>) => void }) {
  const [picked, setPicked] = useState<string>("");
  const [pat, setPat] = useState<{ status: "idle" | "loading" | "done" | "error"; data?: PatternData; message?: string }>({ status: "idle" });

  const pick = (p: Preset) => {
    setPicked(p.id);
    onChange({ travelType: p.travelType, themes: p.themes, notes: p.notes + (input.notes && !input.notes.startsWith("처음") ? `\n${input.notes}` : "") });
  };

  const loadPatterns = async () => {
    const parts = input.destination.split(",").map(s => s.trim()).filter(Boolean);
    if (!parts.length) { setPat({ status: "error", message: "여행지를 먼저 넣어 주세요." }); return; }
    setPat({ status: "loading" });
    try {
      const r = await fetch("/api/engine/patterns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: parts[0], country: parts.length > 1 ? parts[parts.length - 1] : "", length: input.days > 1 ? "multi" : "day", audience: input.travelType === "senior" ? "senior" : input.travelType === "honeymoon" ? "couple" : "any" }),
      });
      const j = await r.json();
      setPat(r.ok ? { status: "done", data: j as PatternData } : { status: "error", message: j?.error?.message ?? "불러오지 못했습니다." });
    } catch { setPat({ status: "error", message: "서버에 연결하지 못했습니다." }); }
  };

  const addToNotes = (d: PatternData) => {
    const must = (d.mustSee ?? []).map(m => m.name).slice(0, 8).join(", ");
    const route = d.routes?.[0]?.order?.join(" → ") ?? "";
    const line = `[인기 투어 참고] 필수: ${must}${route ? ` / 대표 동선: ${route}` : ""}${d.typicalStart ? ` / 보통 ${d.typicalStart} 출발` : ""}`;
    onChange({ notes: [input.notes, line].filter(Boolean).join("\n") });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Wand2 className="h-3.5 w-3.5 text-indigo-600" aria-hidden />빠르게 시작 <span className="font-normal text-slate-400">— 카드 하나로 유형·테마·요청을 채웁니다</span></div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {PRESETS.map(p => (
          <button key={p.id} type="button" onClick={() => pick(p)}
            className={`rounded-md border px-2.5 py-1.5 text-left transition-colors ${picked === p.id ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-indigo-300"}`}>
            <span className="block text-xs font-semibold text-slate-800">{p.label}</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{p.hint}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={loadPatterns} disabled={pat.status === "loading"}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60">
        {pat.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Route className="h-3.5 w-3.5" aria-hidden />}
        이 지역 인기 투어 동선 보기
      </button>
      {pat.status === "error" && <p className="text-[11px] text-rose-600">{pat.message}</p>}
      {pat.status === "loading" && <p className="text-[11px] text-slate-500">잘 팔리는 투어들의 코스 구조를 찾는 중… (20~60초, 같은 지역은 다음부터 바로)</p>}
      {pat.status === "done" && pat.data && (
        <div className="rounded-md border border-slate-200 bg-white p-2.5 text-[11px] leading-4 text-slate-600">
          {pat.data.summary && <p className="mb-1.5 text-slate-700">{pat.data.summary}</p>}
          {!!pat.data.mustSee?.length && <p><b className="text-slate-800">빠지지 않는 곳</b> {pat.data.mustSee.map(m => m.name).join(" · ")}</p>}
          {pat.data.routes?.map((r, i) => <p key={i}><b className="text-slate-800">{r.title}</b> {r.order.join(" → ")}{r.note ? ` (${r.note})` : ""}</p>)}
          {pat.data.typicalStart && <p><b className="text-slate-800">보통 출발</b> {pat.data.typicalStart}{pat.data.typicalLengthHours ? ` · 약 ${pat.data.typicalLengthHours}시간` : ""}</p>}
          {!!pat.data.tips?.length && <ul className="mt-1 list-disc pl-4">{pat.data.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
          <button type="button" onClick={() => addToNotes(pat.data!)} className="mt-2 rounded border border-indigo-300 bg-indigo-600 px-2 py-1 font-semibold text-white">요청 메모에 넣기</button>
          <span className="ml-2 text-slate-400">상품 문구·사진은 가져오지 않고 구조만 참고합니다</span>
        </div>
      )}
    </div>
  );
}

interface PatternData {
  summary?: string; typicalStart?: string; typicalLengthHours?: number;
  mustSee?: { name: string; nameEn?: string; why?: string }[];
  routes?: { title: string; order: string[]; note?: string }[];
  stayHints?: { name: string; minutes: number }[];
  tips?: string[];
}
