"use client";

/**
 * "우리에게 요청하기" — 항공권·호텔·유심 등을 눌러 항목별로 짧게 적고 [견적 요청]/[예약 요청].
 * 코스를 안 만들어도 쓸 수 있고, 만든 코스가 있으면 "코스도 함께 보내기".
 */
import { useState } from "react";
import { SERVICE_IDS, SERVICE_LABEL, type ServiceId } from "@/lib/publicPlan";
import { ASK_FIELDS, ASK_ICON, ASK_KIND_LABEL, type ServiceRequest } from "@/lib/serviceRequest";

const field = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none";

export interface AskContext {
  destination: string;
  date: string;
  nights: number;
  travelers: number;
  /** 추천 숙소 구역 (코스가 있으면) */
  hotelArea: string;
  /** 이 방식에서 보통 맡기는 것 (추천 표시) */
  suggested: ServiceId[];
}

/** 처음 펼칠 때 채워 둘 값 */
function prefill(id: ServiceId, c: AskContext): Record<string, string> {
  const back = c.date && c.nights > 0 ? new Date(new Date(`${c.date}T00:00:00`).getTime() + c.nights * 86_400_000).toISOString().slice(0, 10) : "";
  switch (id) {
    case "flight":
      return { from: "인천", go: c.date, back, seat: "일반석", time: "상관없음" };
    case "hotel":
      return { area: c.hotelArea, checkin: c.date, nights: c.nights ? String(c.nights) : "", grade: "4성" };
    case "esim":
      return { type: "eSIM", phone: "아이폰", days: c.nights ? String(c.nights + 1) : "", data: "무제한", count: String(c.travelers) };
    case "insurance":
      return { people: String(c.travelers), level: "기본" };
    case "pass":
      return { start: c.date };
    case "tour":
      return { date: c.date, kind: "조인(여럿이 함께)" };
    case "transfer":
      return { way: "픽업+샌딩" };
    case "guide":
      return { days: c.nights ? String(c.nights + 1) : "", car: c.travelers > 6 ? "미니버스(~20명)" : "승용·밴(~6명)", lang: "한국어 가이드" };
    default:
      return {};
  }
}

export function AskUs({
  ctx,
  hasPlan,
  initial,
  color,
  send,
}: {
  ctx: AskContext;
  hasPlan: boolean;
  initial: { name: string; phone: string };
  color: string;
  send: (body: { name: string; contact: string; consent: boolean; asks: ServiceRequest; requests: string; withPlan: boolean }) => Promise<void>;
}) {
  const [picked, setPicked] = useState<ServiceId[]>([]);
  const [details, setDetails] = useState<Partial<Record<ServiceId, Record<string, string>>>>({});
  const [who, setWho] = useState({ name: initial.name, contact: initial.phone, how: "카카오톡", when: "", note: "", consent: false, withPlan: true });
  const [state, setState] = useState<{ busy: boolean; sent: "" | ServiceRequest["kind"]; error: string }>({ busy: false, sent: "", error: "" });

  const toggle = (id: ServiceId) => {
    if (picked.includes(id)) setPicked((cur) => cur.filter((x) => x !== id));
    else {
      setPicked((cur) => [...cur, id].sort((a, b) => SERVICE_IDS.indexOf(a) - SERVICE_IDS.indexOf(b)));
      setDetails((cur) => (cur[id] ? cur : { ...cur, [id]: prefill(id, ctx) }));
    }
  };
  const setField = (id: ServiceId, key: string, v: string) => setDetails((cur) => ({ ...cur, [id]: { ...(cur[id] ?? {}), [key]: v } }));
  const ready = picked.length > 0 && who.name.trim() && who.contact.trim().length >= 5 && who.consent && ctx.destination;

  const submit = async (kind: ServiceRequest["kind"]) => {
    setState({ busy: true, sent: "", error: "" });
    try {
      await send({
        name: who.name,
        contact: who.contact,
        consent: who.consent,
        requests: who.note,
        withPlan: hasPlan && who.withPlan,
        asks: { kind, items: picked.map((id) => ({ id, details: Object.fromEntries(Object.entries(details[id] ?? {}).filter(([, v]) => v.trim())) })), contactHow: who.how, contactWhen: who.when },
      });
      setState({ busy: false, sent: kind, error: "" });
    } catch (e) {
      setState({ busy: false, sent: "", error: e instanceof Error ? e.message : "보내지 못했습니다." });
    }
  };

  return (
    <section id="plan-ask" aria-label="우리에게 요청하기" className="scroll-mt-4 space-y-2 rounded-xl border-2 p-3 print:hidden" style={{ borderColor: color }}>
      <header>
        <h2 className="text-sm font-bold text-slate-900">🧾 우리에게 요청하기</h2>
        <p className="text-[11px] text-slate-500">필요한 것만 누르세요 — 코스를 만들지 않아도 됩니다. 누른 항목만 짧게 적으면 담당자가 연락드립니다.</p>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {SERVICE_IDS.map((id) => {
          const on = picked.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? "text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"}`}
              style={on ? { background: color, borderColor: color } : undefined}
            >
              {ASK_ICON[id]} {SERVICE_LABEL[id]}
              {!on && ctx.suggested.includes(id) && <span className="ml-1 text-[10px] text-amber-600">추천</span>}
            </button>
          );
        })}
      </div>

      {picked.map((id) => (
        <fieldset key={id} aria-label={`${SERVICE_LABEL[id]} 요청 내용`} className="space-y-1 rounded-lg bg-slate-50 p-2">
          <legend className="px-1 text-xs font-semibold text-slate-700">
            {ASK_ICON[id]} {SERVICE_LABEL[id]}
          </legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {ASK_FIELDS[id].map((f) => {
              const v = details[id]?.[f.key] ?? "";
              const label = `${SERVICE_LABEL[id]} ${f.label}`;
              return (
                <label key={f.key} className="space-y-0.5 text-[11px] text-slate-600">
                  <span>{f.label}</span>
                  {f.type === "select" ? (
                    <select value={v} onChange={(e) => setField(id, f.key, e.target.value)} className={field} aria-label={label}>
                      <option value="">선택</option>
                      {f.options!.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input type={f.type} min={f.type === "number" ? 0 : undefined} value={v} placeholder={f.placeholder} onChange={(e) => setField(id, f.key, e.target.value)} className={field} aria-label={label} />
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {picked.length > 0 && !state.sent && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <input value={who.name} onChange={(e) => setWho((w) => ({ ...w, name: e.target.value }))} placeholder="이름" className={field} aria-label="요청 이름" />
            <input value={who.contact} onChange={(e) => setWho((w) => ({ ...w, contact: e.target.value }))} placeholder="휴대폰 또는 이메일" className={field} aria-label="요청 연락처" />
            <select value={who.how} onChange={(e) => setWho((w) => ({ ...w, how: e.target.value }))} className={field} aria-label="요청 연락 방법">
              {["카카오톡", "전화", "문자", "이메일"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <input value={who.when} onChange={(e) => setWho((w) => ({ ...w, when: e.target.value }))} placeholder="연락 가능 시간 (예: 평일 저녁)" className={field} aria-label="요청 연락 가능 시간" />
          </div>
          <textarea value={who.note} onChange={(e) => setWho((w) => ({ ...w, note: e.target.value }))} rows={2} placeholder="더 적을 것 (선택)" className={field} aria-label="요청 메모" />
          {hasPlan && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <input type="checkbox" checked={who.withPlan} onChange={(e) => setWho((w) => ({ ...w, withPlan: e.target.checked }))} />
              만든 코스도 함께 보내기
            </label>
          )}
          <label className="flex items-start gap-1.5 text-[11px] text-slate-600">
            <input type="checkbox" checked={who.consent} onChange={(e) => setWho((w) => ({ ...w, consent: e.target.checked }))} aria-label="요청 개인정보 동의" className="mt-0.5" />
            <span>[필수] 상담을 위해 이름·연락처를 수집·이용하는 데 동의합니다. 상담이 끝나면 지웁니다.</span>
          </label>
          {!ctx.destination && <p className="text-[11px] text-rose-700">위에 여행지를 먼저 적어 주세요.</p>}
          {state.error && <p className="text-[11px] text-rose-700">{state.error}</p>}
          <div className="flex gap-1.5">
            <button type="button" disabled={!ready || state.busy} onClick={() => void submit("quote")} className="flex-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ borderColor: color, color }}>
              {ASK_KIND_LABEL.quote} (가격 먼저)
            </button>
            <button type="button" disabled={!ready || state.busy} onClick={() => void submit("booking")} className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ background: color }}>
              {ASK_KIND_LABEL.booking} (바로 진행)
            </button>
          </div>
        </div>
      )}
      {state.sent && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {ASK_KIND_LABEL[state.sent]}을 보냈습니다 — {picked.map((x) => SERVICE_LABEL[x]).join(" · ")}. {who.how}(으)로 곧 연락드릴게요.
        </p>
      )}
    </section>
  );
}
