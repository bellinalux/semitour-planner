import { z } from "zod";
import { explainMinutes, findScript, type GuideBasics, type GuideScript } from "@/lib/guideBook";
import { computeItemTimings, dayMeetingTime, dayTourStart } from "@/lib/dayLoad";
import { timeRange } from "@/lib/dayTidy";
import { dayDate, dayMeals, documentItems, tripPeriod } from "@/lib/documents";
import { continuousDriving } from "@/lib/driverHours";
import { formatDuration } from "@/lib/format";
import { dayRegion, dayTable, defaultAlternative, mealLabel, visitStyle } from "@/lib/itineraryDoc";
import type { PmChoice } from "@/lib/itinerary";
import type { Participant } from "@/lib/opsStore";
import type { CompanyProfile, CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";

/**
 * 가이드용 운영 페이지(/g/아이디) — 운영 지시서를 휴대폰으로 보는 링크. 가격·원가는 없다.
 * 가이드는 일정마다 진행 체크(도착·출발)를 하고, 일정 변경·지연·사고를 시각과 함께 남긴다(고객 동의 여부 포함).
 * 참가자 명단은 직원이 "명단 포함"을 골랐을 때만 넣는다 (이름·객실·특이사항만).
 */

const str = (max: number) => z.string().max(max);

export const guideSheetSchema = z.object({
  title: str(120),
  period: str(80),
  travelers: z.number().int().min(0).max(500),
  company: z.object({ name: str(80), emergency: str(200), phone: str(40) }),
  notes: z.array(z.object({ label: str(30), value: str(300) })).max(12),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(60),
        date: str(30),
        region: str(80),
        meeting: str(10),
        meals: str(160),
        hotel: str(160),
        rows: z.array(z.object({ key: str(60), time: str(20), title: str(200), move: z.boolean(), notes: z.array(str(200)).max(8) })).max(60),
        warnings: z.array(str(240)).max(10),
        options: z.array(str(240)).max(10),
      }),
    )
    .max(60),
  names: z.array(z.object({ name: str(60), room: z.number().int().min(0).max(999), note: str(80) })).max(200).default([]),
  /** 가이드 해설집 원고 (이 일정 장소 중 원고가 있는 곳) — 현장에서 휴대폰으로 본다 */
  scripts: z
    .array(
      z.object({
        name: str(80),
        status: z.enum(["draft", "reviewed"]),
        minutes: z.number().int().min(0).max(240),
        intro: str(400),
        points: z.array(z.object({ title: str(80), text: str(1200) })).max(8),
        cautions: z.array(str(240)).max(8),
        meetPoint: str(400),
        mustKnow: z.array(str(300)).max(5),
        /** 영어 원고 (있으면) */
        en: z
          .object({ intro: str(700), points: z.array(z.object({ title: str(160), text: str(2000) })).max(8), cautions: z.array(str(400)).max(8), meetPoint: str(400), mustKnow: z.array(str(300)).max(5) })
          .optional(),
      }),
    )
    .max(80)
    .default([]),
  /** 진행 멘트·기본기·비상 대응 (회사 교육 자료) */
  tips: z.array(z.object({ title: str(60), lines: z.array(str(400)).max(20) })).max(20).default([]),
  updatedAt: str(40),
});
export type GuideSheet = z.infer<typeof guideSheetSchema>;

export const LOG_TYPES = ["일정 변경", "지연", "사고·부상", "고객 요청", "기타"] as const;
export const guideLogSchema = z.object({
  type: z.enum(LOG_TYPES),
  day: z.number().int().min(0).max(60),
  text: z.string().trim().min(1).max(300),
  /** 일정 변경이면 고객 동의 여부 (표준안: 변경 시 동의) */
  consent: z.enum(["yes", "no", "na"]).default("na"),
  by: z.string().trim().max(30).default(""),
});
export type GuideLogInput = z.infer<typeof guideLogSchema>;
export interface GuideLog extends GuideLogInput {
  at: string;
}

export interface GuideState {
  progress: Record<string, string>;
  logs: GuideLog[];
}

export function buildGuideSheet(
  d: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice; quote: QuoteData; meta: CourseMeta | null; company: CompanyProfile },
  participants: Participant[] = [],
  now = new Date(),
): GuideSheet {
  const { input, days, pmChoice, quote, meta, company } = d;
  const travelers = quote.travelers;
  const vehicle = quote.ourIncludes.vehicle;
  const f = input.selectedFlight;
  const full = input.packageType === "full";
  const origin = input.originCity?.trim() || "인천";
  const cut = (s: string, n: number) => s.slice(0, n);
  const notes = [
    ...(f?.flightNumber ? [{ label: "항공", value: `가는 편 ${f.flightNumber} ${f.departTime}→${f.arriveTime}${f.returnFlightNumber ? ` / 오는 편 ${f.returnFlightNumber} ${f.returnDepartTime}→${f.returnArriveTime}` : ""}` }] : []),
    ...(input.pickupNote.trim() ? [{ label: "공항 픽업", value: input.pickupNote.trim() }] : []),
    ...(input.sendingNote.trim() ? [{ label: "공항 샌딩", value: input.sendingNote.trim() }] : []),
    ...(input.customerName.trim() ? [{ label: "고객·단체", value: input.customerName.trim() }] : []),
    { label: "가이드 경비", value: input.tipPerPerson > 0 ? "상품가 포함 — 고객에게 따로 받지 않음" : "현지 지불 (출발 전 안내한 금액)" },
    { label: "쇼핑", value: days.some((x) => [...x.items, ...x.amGuided].some((i) => i.type === "shopping")) ? "일정표에 있는 곳만, 구매 강요 금지" : "노쇼핑 — 쇼핑센터 방문 금지" },
  ].map((n) => ({ label: cut(n.label, 30), value: cut(n.value, 300) }));
  return {
    title: cut(meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`, 120),
    period: cut(`${tripPeriod(input)} (${input.nights}박 ${input.days}일)`, 80),
    travelers,
    company: { name: cut(company.name, 80), emergency: cut(company.emergencyContact.trim(), 200), phone: cut(company.phone, 40) },
    notes,
    days: days.slice(0, 60).map((day, index) => {
      const flat = documentItems(day, pmChoice).flatMap((b) => b.items);
      const timings = computeItemTimings(flat, dayTourStart(day));
      const table = dayTable(days, index, pmChoice, { vehicle, flight: { out: f?.flightNumber ?? "", back: f?.returnFlightNumber ?? "" }, selectedHotels: input.selectedHotels }, timings);
      const m = dayMeals(days, index, pmChoice, input);
      const rows = table.rows.map((r) => {
        if (r.kind === "move") return { key: r.key, time: "", title: `↓ ${r.moveName ?? (vehicle ? "전용차량" : "이동")}${r.minutes ? ` ${formatDuration(r.minutes)}` : ""}`, move: true, notes: [] };
        if (r.kind === "meeting") return { key: r.key, time: r.start, title: "호텔 로비 미팅 · 인원 확인 후 출발", move: false, notes: [`${travelers}명`] };
        if (r.kind === "label") return { key: r.key, time: "", title: r.label ?? "", move: true, notes: [] };
        if (r.kind === "free") return { key: r.key, time: "", title: "전일 자유일정 (가이드·차량 없음)", move: false, notes: r.tips ?? [] };
        const it = r.item!;
        const style = visitStyle(it);
        const n: string[] = [];
        if (it.type === "meal") n.push(`${travelers}명 식사${it.payment === "local" ? " · 식대 현지 지불" : ""}${it.cuisine ? ` (${it.cuisine})` : ""}`);
        else if (it.entryFee > 0) n.push(it.payment === "local" ? "입장료 현지 지불" : `입장권 ${travelers}매`);
        if (it.timeCheck?.basis === "area" && it.timeCheck.dropOff) n.push(`하차: ${it.timeCheck.dropOff}`);
        if (it.timeCheck?.basis === "area" && it.timeCheck.pickUp) n.push(`픽업: ${it.timeCheck.pickUp}`);
        if (it.caution) n.push(`⚠ ${it.caution}`);
        if (r.returnFlight) n.push("출발 2~3시간 전 공항 도착");
        return { key: r.key, time: r.start ? timeRange({ start: r.start, end: r.end }, "–") : "", title: cut(`${it.name}${style ? ` [${style}]` : ""}`, 200), move: false, notes: n.map((x) => cut(x, 200)).slice(0, 8) };
      });
      return {
        day: day.day,
        date: dayDate(input, day.day) ?? "",
        region: cut(dayRegion(days, index, origin), 80),
        meeting: dayMeetingTime(day),
        meals: cut(`조 ${mealLabel(m.breakfast, "breakfast", table.flightDay, full)} · 중 ${mealLabel(m.lunch, "lunch", table.flightDay, full)} · 석 ${mealLabel(m.dinner, "dinner", table.flightDay, full)}`, 160),
        hotel: cut(table.overnight ? (table.overnight.hotel ?? `${table.overnight.city} 호텔 (확정 전)`) : "", 160),
        rows: rows.slice(0, 60),
        warnings: continuousDriving(day, pmChoice).map((w) => cut(`연속 운전 ${formatDuration(w.minutes)} — 중간 30분 휴게`, 240)),
        options: input.options.filter((o) => o.dayNo === day.day).map((o) => cut(`선택관광 ${o.name} — 최소 ${o.minParticipants}명 · 미참여: ${o.alternative?.trim() || defaultAlternative(o)}`, 240)),
      };
    }),
    names: participants.slice(0, 200).map((p) => ({ name: cut(p.name, 60), room: p.room, note: cut(p.note, 80) })),
    scripts: [],
    tips: [],
    updatedAt: now.toISOString(),
  };
}

/** 현장 보고서 (직원이 고객·회사에 남기는 글) */
export function fieldReport(sheet: Pick<GuideSheet, "title" | "period">, state: GuideState): string {
  const consent = { yes: "고객 동의", no: "동의 못 받음", na: "" } as const;
  return [
    `[현장 보고] ${sheet.title} (${sheet.period})`,
    `진행 체크 ${Object.keys(state.progress).length}건 · 기록 ${state.logs.length}건`,
    "",
    ...(state.logs.length === 0
      ? ["기록 없음"]
      : state.logs.map((l) => {
          const d = new Date(l.at);
          const t = Number.isNaN(d.getTime()) ? l.at : `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          return `· ${t}${l.day ? ` DAY ${l.day}` : ""} [${l.type}] ${l.text}${consent[l.consent] ? ` (${consent[l.consent]})` : ""}${l.by ? ` — ${l.by}` : ""}`;
        })),
  ].join("\n");
}

/** "1시간 30분" → 90 */
function minutesIn(text: string): number {
  const h = /(\d+)\s*시간/.exec(text);
  const m = /(\d+)\s*분/.exec(text);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

/**
 * 현장 실측 체류 — 가이드가 체크한 시각 사이(앞 장소 체크 → 이 장소 체크)에서 그 사이 이동 시간(일정표 값)을 빼서 잰다.
 * 10분~10시간 사이만 (빠뜨렸다가 몰아서 체크한 것은 뺀다). 장소 이름의 [입장]·[하차] 표시는 지운다.
 */
export function fieldStays(sheet: Pick<GuideSheet, "days">, state: Pick<GuideState, "progress">): { name: string; minutes: number }[] {
  const out: { name: string; minutes: number }[] = [];
  for (const day of sheet.days) {
    let last: number | null = null;
    let travel = 0;
    for (const r of day.rows) {
      if (r.move) {
        travel += minutesIn(r.title);
        continue;
      }
      const at = state.progress[`${day.day}:${r.key}`];
      const t = at ? new Date(at).getTime() : NaN;
      if (!Number.isFinite(t)) {
        last = null;
        travel = 0;
        continue;
      }
      if (last !== null && !/미팅|자유일정/.test(r.title)) {
        const stay = Math.round((t - last) / 60_000) - travel;
        if (stay >= 10 && stay <= 600) out.push({ name: r.title.replace(/\s*\[[^\]]*\]\s*$/, "").trim(), minutes: stay });
      }
      last = t;
      travel = 0;
    }
  }
  return out;
}

/** 가이드 링크에 해설집 원고·교육 자료를 붙인다 — 일정 줄 이름에 맞는 원고만, 같은 원고는 한 번 */
export function attachGuide(sheet: GuideSheet, scripts: GuideScript[], basics: GuideBasics | null): GuideSheet {
  const picked = new Map<string, GuideScript>();
  for (const d of sheet.days) {
    for (const r of d.rows) {
      if (r.move) continue;
      const s = findScript(scripts, r.title);
      if (s && !picked.has(s.key)) picked.set(s.key, s);
    }
  }
  return {
    ...sheet,
    scripts: [...picked.values()].slice(0, 80).map((s) => ({
      name: s.name,
      status: s.status,
      minutes: Math.min(240, explainMinutes(s)),
      intro: s.intro,
      points: s.points.map((p) => ({ title: p.title, text: p.text })),
      cautions: s.cautions,
      meetPoint: s.site.meetPoint,
      mustKnow: s.mustKnow,
      ...(s.en ? { en: { intro: s.en.intro, points: s.en.points.map((p) => ({ title: p.title, text: p.text })), cautions: s.en.cautions, meetPoint: s.en.site.meetPoint, mustKnow: s.en.mustKnow } } : {}),
    })),
    tips: (basics?.sections ?? [])
      .filter((b) => b.group !== "상품 원칙" && b.lines.some((l) => l.trim()))
      .slice(0, 20)
      .map((b) => ({ title: b.title, lines: b.lines.filter((l) => l.trim()).slice(0, 20) })),
  };
}
