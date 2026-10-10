"use client";

import { useState } from "react";
import { STYLE_LABEL, type InquiryInput } from "@/lib/inquiry";

const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

/** 견적 요청 폼 — 이름·연락처·여행지·출발·박수·인원·1인 예산·여행 방식·요청 사항 */
export function InquiryForm() {
  const [f, setF] = useState<InquiryInput>({ name: "", contact: "", destination: "", departure: "", nights: 0, travelers: 2, budget: 0, style: "unsure", requests: "", website: "" });
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; message?: string }>({ status: "idle" });
  const set = (patch: Partial<InquiryInput>) => setF((p) => ({ ...p, ...patch }));

  if (state.status === "done") return <p className="rounded-xl bg-emerald-50 px-4 py-6 text-center font-semibold text-emerald-800">요청을 받았습니다. 곧 연락드리겠습니다!</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ status: "sending" });
        try {
          const r = await fetch("/api/inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
          if (!r.ok) {
            const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
            return setState({ status: "error", message: j?.error?.message ?? "보내지 못했습니다." });
          }
          setState({ status: "done" });
        } catch {
          setState({ status: "error", message: "연결이 끊겼습니다. 잠시 뒤 다시 보내 주세요." });
        }
      }}
    >
      <label className="block space-y-1">
        <span className="text-xs text-slate-600">이름 *</span>
        <input required value={f.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} className={field} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-slate-600">연락처 (전화·이메일·카톡 ID) *</span>
        <input required value={f.contact} maxLength={60} onChange={(e) => set({ contact: e.target.value })} className={field} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-slate-600">가고 싶은 곳 *</span>
        <input required value={f.destination} maxLength={60} placeholder="예) 다낭, 마카오·홍콩" onChange={(e) => set({ destination: e.target.value })} className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-slate-600">출발일 (모르면 비워 두세요)</span>
          <input type="date" value={f.departure} onChange={(e) => set({ departure: e.target.value })} className={field} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-600">박수</span>
          <input type="number" min={0} max={30} value={f.nights || ""} onChange={(e) => set({ nights: Math.max(0, Math.min(30, Math.round(Number(e.target.value) || 0))) })} className={field} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-600">인원 *</span>
          <input type="number" required min={1} max={200} value={f.travelers} onChange={(e) => set({ travelers: Math.max(1, Math.min(200, Math.round(Number(e.target.value) || 1))) })} className={field} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-600">1인 예산 (원, 선택)</span>
          <input type="number" min={0} step={10000} value={f.budget || ""} onChange={(e) => set({ budget: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={field} />
        </label>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs text-slate-600">여행 방식</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(STYLE_LABEL) as InquiryInput["style"][]).map((s) => (
            <label key={s} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${f.style === s ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600"}`}>
              <input type="radio" name="style" className="sr-only" checked={f.style === s} onChange={() => set({ style: s })} />
              {STYLE_LABEL[s]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1">
        <span className="text-xs text-slate-600">요청 사항 (선택)</span>
        <textarea rows={4} value={f.requests} maxLength={500} placeholder="예) 부모님 칠순 여행, 걷는 일정 적게, 노쇼핑 원함" onChange={(e) => set({ requests: e.target.value })} className={field} />
      </label>
      {/* 사람에게는 안 보이는 칸 — 자동 입력 프로그램만 채운다 */}
      <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={(e) => set({ website: e.target.value })} name="website" />
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      <button type="submit" disabled={state.status === "sending"} className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {state.status === "sending" ? "보내는 중…" : "견적 요청하기"}
      </button>
    </form>
  );
}
