import { addDays, parseDate } from "@/lib/documents";
import type { CurrencyCode, QuoteData, TripInput } from "@/types";

/**
 * 예약 관리 — 견적을 낸 뒤 실제 예약이 어디까지 왔는지(문의 → 견적 발송 → 계약 → 계약금 → 완납 → 출발)와
 * 입금 기한을 한곳에서 본다. 서버 저장을 쓸 수 있으면 팀 공용, 아니면 이 브라우저에만 남는다.
 */
export const BOOKING_STATUSES = ["inquiry", "quoted", "contracted", "deposit", "paid", "departed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const STATUS_LABEL: Record<BookingStatus, string> = {
  inquiry: "문의",
  quoted: "견적 발송",
  contracted: "계약",
  deposit: "계약금 입금",
  paid: "완납",
  departed: "출발 완료",
  cancelled: "취소",
};

export const MAX_BOOKINGS = 500;
/** 계약금 기본 비율(%)과 잔금 기한(출발 며칠 전) — 업계에서 흔히 쓰는 값. 예약마다 고칠 수 있다 */
export const DEFAULT_DEPOSIT_RATE = 10;
export const DEFAULT_BALANCE_DAYS_BEFORE = 30;

export interface BookingHistory {
  at: string;
  by: string;
  text: string;
}

export interface Booking {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** 처음 만든 사람 */
  owner: string;
  ownerId: string;
  customerName: string;
  phone: string;
  email: string;
  destination: string;
  departureDate: string;
  days: number;
  nights: number;
  travelers: number;
  currency: CurrencyCode;
  totalPrice: number;
  depositAmount: number;
  /** 지금까지 받은 금액 합계 */
  paidAmount: number;
  depositDue: string;
  balanceDue: string;
  status: BookingStatus;
  /** 연결한 견적·일정 이름 */
  planName: string;
  memo: string;
  history: BookingHistory[];
  /** 연결한 일정의 도시·장소 (지식 창고 학습: 성약·후기) */
  city?: string;
  places?: string[];
}

const CURRENCIES: CurrencyCode[] = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, max = 1e11) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v * 100) / 100)) : 0);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** 들어온 값을 예약 형식으로 다듬는다. 고객 이름이 없으면 null */
export function parseBooking(v: unknown): Booking | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const customerName = str(o.customerName, 60);
  const id = str(o.id, 40);
  if (!customerName || !/^b-[a-z0-9-]{4,36}$/.test(id)) return null;
  const history = Array.isArray(o.history)
    ? (o.history as unknown[])
        .filter((h): h is BookingHistory => typeof h === "object" && h !== null && typeof (h as BookingHistory).text === "string")
        .slice(0, 100)
        .map((h) => ({ at: str(h.at, 40), by: str(h.by, 40), text: str(h.text, 200) }))
    : [];
  return {
    id,
    createdAt: str(o.createdAt, 40),
    updatedAt: str(o.updatedAt, 40),
    owner: str(o.owner, 40),
    ownerId: str(o.ownerId, 40),
    customerName,
    phone: str(o.phone, 40),
    email: str(o.email, 100),
    destination: str(o.destination, 100),
    departureDate: date(o.departureDate),
    days: num(o.days, 60),
    nights: num(o.nights, 60),
    travelers: num(o.travelers, 999),
    currency: CURRENCIES.includes(o.currency as CurrencyCode) ? (o.currency as CurrencyCode) : "KRW",
    totalPrice: num(o.totalPrice),
    depositAmount: num(o.depositAmount),
    paidAmount: num(o.paidAmount),
    depositDue: date(o.depositDue),
    balanceDue: date(o.balanceDue),
    status: BOOKING_STATUSES.includes(o.status as BookingStatus) ? (o.status as BookingStatus) : "inquiry",
    planName: str(o.planName, 100),
    memo: str(o.memo, 2000),
    history,
    ...(str(o.city, 60) ? { city: str(o.city, 60) } : {}),
    ...(Array.isArray(o.places) ? { places: (o.places as unknown[]).map((p) => str(p, 80)).filter(Boolean).slice(0, 40) } : {}),
  };
}

export function newBookingId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 지금 견적으로 새 예약 초안 (고객 이름은 수신처, 계약금 10%, 잔금은 출발 30일 전) */
export function bookingFromQuote(input: TripInput, customerQuote: QuoteData | null, today: Date = new Date()): Omit<Booking, "id" | "createdAt" | "updatedAt" | "owner" | "ownerId" | "history"> {
  const total = customerQuote?.scenario.totalPrice ?? 0;
  const departure = parseDate(input.departureDate);
  let balanceDue = "";
  if (departure) {
    const due = addDays(departure, -DEFAULT_BALANCE_DAYS_BEFORE);
    // 출발이 30일 안이면 잔금 기한을 출발 3일 전(그것도 지났으면 오늘)로
    balanceDue = iso(due > today ? due : addDays(departure, -3) > today ? addDays(departure, -3) : today);
  }
  return {
    customerName: input.customerName.trim(),
    phone: "",
    email: "",
    destination: input.destination.trim(),
    departureDate: input.departureDate,
    days: input.days,
    nights: input.nights,
    travelers: input.travelers,
    currency: input.currency,
    totalPrice: total,
    depositAmount: Math.round((total * DEFAULT_DEPOSIT_RATE) / 100),
    paidAmount: 0,
    depositDue: iso(addDays(today, 3)),
    balanceDue,
    status: "quoted",
    planName: "",
    memo: "",
  };
}

/** 이전 값과 비교해 상태·입금 변경을 이력에 남긴다 (서버·브라우저 저장이 같은 규칙을 쓴다) */
export function withHistory(prev: Booking | null, next: Booking, by: string, now = new Date().toISOString()): Booking {
  const history = [...(prev?.history ?? next.history ?? [])];
  const add = (text: string) => history.unshift({ at: now, by, text });
  if (!prev) add(`예약 등록 (${STATUS_LABEL[next.status]})`);
  else {
    if (prev.status !== next.status) add(`상태: ${STATUS_LABEL[prev.status]} → ${STATUS_LABEL[next.status]}`);
    if (prev.paidAmount !== next.paidAmount) add(`받은 금액: ${prev.paidAmount.toLocaleString("ko-KR")} → ${next.paidAmount.toLocaleString("ko-KR")}`);
    if (prev.totalPrice !== next.totalPrice) add(`판매 금액: ${prev.totalPrice.toLocaleString("ko-KR")} → ${next.totalPrice.toLocaleString("ko-KR")}`);
  }
  return {
    ...next,
    createdAt: prev?.createdAt || next.createdAt || now,
    owner: prev?.owner || next.owner || by,
    ownerId: prev?.ownerId || next.ownerId,
    updatedAt: now,
    history: history.slice(0, 100),
  };
}

export type AlertLevel = "danger" | "warn";
export interface BookingAlert {
  level: AlertLevel;
  text: string;
}

const dayDiff = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);

/** 견적을 보낸 뒤 이만큼 답이 없으면 연락 (일) */
export const FOLLOW_UP_DAYS = 3;
/** 견적 유효기간 (일) — 지나면 요금(항공·환율·호텔)이 바뀌었을 수 있어 다시 견적 */
export const QUOTE_VALID_DAYS = 14;

/** 입금 기한·출발일 기준 알림 (취소·출발 완료는 없음) */
export function bookingAlerts(b: Booking, today: Date = new Date()): BookingAlert[] {
  if (b.status === "cancelled" || b.status === "departed") return [];
  const out: BookingAlert[] = [];
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const unpaid = Math.max(0, b.totalPrice - b.paidAmount);
  const depositDue = parseDate(b.depositDue);
  const balanceDue = parseDate(b.balanceDue);
  const departure = parseDate(b.departureDate);
  const active = b.status !== "inquiry";

  if (active && depositDue && b.depositAmount > 0 && b.paidAmount < b.depositAmount) {
    const d = dayDiff(t, depositDue);
    if (d < 0) out.push({ level: "danger", text: `계약금 기한 ${-d}일 지남` });
    else if (d <= 2) out.push({ level: "warn", text: d === 0 ? "계약금 기한 오늘" : `계약금 기한 D-${d}` });
  }
  if (active && balanceDue && unpaid > 0) {
    const d = dayDiff(t, balanceDue);
    if (d < 0) out.push({ level: "danger", text: `잔금 기한 ${-d}일 지남` });
    else if (d <= 3) out.push({ level: "warn", text: d === 0 ? "잔금 기한 오늘" : `잔금 기한 D-${d}` });
  }
  // 견적 후속: 견적 발송 상태로 머문 날 (마지막 수정 기준)
  const touched = b.updatedAt ? new Date(b.updatedAt) : null;
  if (b.status === "quoted" && touched && !Number.isNaN(touched.getTime())) {
    const waited = dayDiff(new Date(touched.getFullYear(), touched.getMonth(), touched.getDate()), t);
    if (waited >= QUOTE_VALID_DAYS) out.push({ level: "warn", text: `견적 ${waited}일 지남 — 유효기간(${QUOTE_VALID_DAYS}일)이 지나 다시 견적` });
    else if (waited >= FOLLOW_UP_DAYS) out.push({ level: "warn", text: `견적 후 ${waited}일 답 없음 — 고객 연락` });
  }
  if (departure) {
    const d = dayDiff(t, departure);
    if (d >= 0 && d <= 7 && unpaid > 0 && active) out.push({ level: "danger", text: `출발 ${d === 0 ? "오늘" : `D-${d}`} · 미수금 ${unpaid.toLocaleString("ko-KR")}` });
    if (d < 0 && b.status !== "paid") out.push({ level: "warn", text: "출발일이 지났습니다 — 상태를 정리하세요" });
  }
  return out;
}

/** 상태별 건수와 받을 돈(취소 제외 미수금 합계, 통화별) */
export function bookingSummary(list: Booking[]) {
  const counts = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0])) as Record<BookingStatus, number>;
  const receivable: Partial<Record<CurrencyCode, number>> = {};
  for (const b of list) {
    counts[b.status] += 1;
    if (b.status !== "cancelled" && b.status !== "inquiry") {
      const unpaid = Math.max(0, b.totalPrice - b.paidAmount);
      if (unpaid > 0) receivable[b.currency] = (receivable[b.currency] ?? 0) + unpaid;
    }
  }
  return { counts, receivable };
}
