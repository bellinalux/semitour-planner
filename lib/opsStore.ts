import type { SupplierBooking } from "@/lib/supplierBookings";
import type { ChecklistItem } from "@/lib/bookingChecklist";
import type { CostLine } from "@/types";

/**
 * 출발 준비·명단·정산 — 상품(일정 이름)마다 이 브라우저에 저장한다 (백업 파일에 포함).
 *  - 체크리스트 진행: 항목별 완료·담당·확정번호
 *  - 참가자 명단·룸리스트: 이름·구분·성별·특이사항·객실 (여권번호 같은 민감 정보는 받지 않는다)
 *  - 행사 후 정산: 견적 원가 항목별 실제 지출, 실제 판매 금액
 */

export interface CheckState {
  done: boolean;
  who: string;
  ref: string;
}

export interface Participant {
  id: string;
  name: string;
  kind: "adult" | "child" | "infant";
  gender: "" | "M" | "F";
  note: string;
  /** 객실 번호 (자동 배정 뒤 고칠 수 있다) */
  room: number;
}

export interface Settlement {
  /** 원가 항목 key → 실제 지출 (없으면 견적 금액 그대로로 본다) */
  actual: Record<string, number>;
  /** 견적에 없던 추가 지출 */
  extras: { id: string; label: string; amount: number }[];
  /** 실제 받은 판매 금액 (0이면 견적 판매가 × 인원) */
  revenue: number;
  memo: string;
}

export interface OpsData {
  checklist: Record<string, CheckState>;
  participants: Participant[];
  settlement: Settlement;
  /** 업체 수배·확정 (수배할 것 키 → 업체·상태·확정 번호) */
  bookings?: Record<string, SupplierBooking>;
}

const keyOf = (planKey: string) => `semitour-planner:ops:${planKey}`;
export const emptyOps = (): OpsData => ({ checklist: {}, participants: [], settlement: { actual: {}, extras: [], revenue: 0, memo: "" } });

export function loadOps(planKey: string): OpsData {
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(planKey)) ?? "null") as Partial<OpsData> | null;
    const base = emptyOps();
    if (!raw) return base;
    return {
      checklist: raw.checklist && typeof raw.checklist === "object" ? raw.checklist : base.checklist,
      participants: Array.isArray(raw.participants) ? raw.participants : base.participants,
      settlement: { ...base.settlement, ...(raw.settlement ?? {}) },
      bookings: raw.bookings && typeof raw.bookings === "object" && !Array.isArray(raw.bookings) ? raw.bookings : {},
    };
  } catch {
    return emptyOps();
  }
}

export function saveOps(planKey: string, data: OpsData): void {
  try {
    localStorage.setItem(keyOf(planKey), JSON.stringify(data));
  } catch {
    /* 저장 못 해도 화면은 계속 */
  }
}

/** 기한이 지났거나 3일 안에 오는데 아직 안 한 항목 */
export function dueChecklist(items: ChecklistItem[], state: Record<string, CheckState>, today = new Date()): { overdue: ChecklistItem[]; soon: ChecklistItem[] } {
  const t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const overdue: ChecklistItem[] = [];
  const soon: ChecklistItem[] = [];
  for (const it of items) {
    if (state[it.label]?.done || !it.due) continue;
    const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(it.due);
    if (!m) continue;
    const d = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - t.getTime()) / 86_400_000);
    if (d < 0) overdue.push(it);
    else if (d <= 3) soon.push(it);
  }
  return { overdue, soon };
}

/** 객실 자동 배정 — 2인 1실 기준, 같은 성별끼리(모르면 순서대로), 유아는 보호자 방에 (방을 차지하지 않음) */
export function assignRooms(list: Participant[], perRoom = 2): Participant[] {
  const size = Math.max(1, Math.round(perRoom));
  let room = 0;
  const out = list.map((p) => ({ ...p, room: 0 }));
  const groups = [out.filter((p) => p.kind !== "infant" && p.gender === "F"), out.filter((p) => p.kind !== "infant" && p.gender === "M"), out.filter((p) => p.kind !== "infant" && p.gender === "")];
  for (const g of groups) for (let i = 0; i < g.length; i += size) {
    room += 1;
    for (const p of g.slice(i, i + size)) p.room = room;
  }
  // 유아는 바로 앞 사람(보호자)의 방
  out.forEach((p, i) => {
    if (p.kind === "infant") p.room = out.slice(0, i).reverse().find((x) => x.kind !== "infant")?.room ?? 1;
  });
  return out;
}

const KIND_TEXT: Record<Participant["kind"], string> = { adult: "성인", child: "아동", infant: "유아" };

/** 호텔·랜드사에 보내는 룸리스트 (탭 구분, 엑셀에 붙여 넣기) */
export function roomingTsv(list: Participant[]): string {
  const rows = [...list].sort((a, b) => a.room - b.room);
  return [["객실", "이름", "구분", "성별", "특이사항"].join("\t"), ...rows.map((p) => [String(p.room || ""), p.name, KIND_TEXT[p.kind], p.gender === "M" ? "남" : p.gender === "F" ? "여" : "", p.note].join("\t"))].join("\n");
}

export interface SettlementResult {
  rows: { key: string; label: string; quoted: number; actual: number; diff: number }[];
  extras: number;
  quotedCost: number;
  actualCost: number;
  revenue: number;
  profit: number;
  /** 실제 마진율 % (판매 금액 대비) */
  marginRate: number | null;
  quotedProfit: number;
}

/** 견적 원가와 실제 지출 비교 */
export function settle(lines: CostLine[], quotedRevenue: number, quotedProfit: number, s: Settlement): SettlementResult {
  const rows = lines
    .filter((l) => !l.excluded && l.amount > 0)
    .map((l) => {
      const actual = s.actual[l.key] ?? l.amount;
      return { key: l.key, label: l.label, quoted: l.amount, actual, diff: actual - l.amount };
    });
  const extras = s.extras.reduce((sum, e) => sum + Math.max(0, e.amount), 0);
  const quotedCost = rows.reduce((sum, r) => sum + r.quoted, 0);
  const actualCost = rows.reduce((sum, r) => sum + r.actual, 0) + extras;
  const revenue = s.revenue > 0 ? s.revenue : quotedRevenue;
  const profit = revenue - actualCost;
  return { rows, extras, quotedCost, actualCost, revenue, profit, marginRate: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null, quotedProfit };
}
