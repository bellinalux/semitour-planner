import type { CurrencyCode, QuoteData, TripInput } from "@/types";

/**
 * 견적 이력 — 고객 문서를 인쇄하거나 고객용 문구를 복사할 때 "누가, 언제, 어떤 조건으로, 얼마에" 냈는지 남긴다.
 * 서버 저장을 쓸 수 있으면 팀 전체가 함께 보고, 아니면 이 브라우저에만 남는다.
 */
export const MAX_QUOTE_LOG = 200;
const LOCAL_KEY = "semitour-planner:quote-log:v1";
const AUTHOR_KEY = "semitour-planner:author:v1";

export type QuoteLogAction = "print" | "copy";

export interface QuoteLogEntry {
  id: string;
  at: string;
  author: string;
  action: QuoteLogAction;
  /** 인쇄한 문서 이름 또는 복사한 문구 종류 */
  document: string;
  destination: string;
  departureDate: string;
  days: number;
  nights: number;
  travelers: number;
  currency: CurrencyCode;
  /** 고객에게 나간 1인 판매가 (선택한 판매 채널 기준) */
  pricePerPerson: number;
  totalPrice: number;
  /** 직판 기준 실제 마진율 (%) */
  marginRate: number;
  channel: string;
}

export function isQuoteLogEntry(v: unknown): v is QuoteLogEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.length <= 40 &&
    typeof o.at === "string" &&
    typeof o.author === "string" &&
    o.author.length <= 40 &&
    (o.action === "print" || o.action === "copy") &&
    typeof o.document === "string" &&
    typeof o.destination === "string" &&
    o.destination.length <= 200 &&
    typeof o.pricePerPerson === "number" &&
    typeof o.totalPrice === "number" &&
    typeof o.travelers === "number"
  );
}

/** documentQuote(고객 문서용 견적)와 원래 견적에서 이력 한 건을 만든다 */
export function buildQuoteLogEntry(input: TripInput, customerQuote: QuoteData, rawQuote: QuoteData, action: QuoteLogAction, document: string, author: string): QuoteLogEntry {
  const channel = input.channels.find((c) => c.id === input.documentChannelId)?.name ?? "직판";
  return {
    id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    author: author.trim().slice(0, 40) || "이름 없음",
    action,
    document,
    destination: input.destination.trim().slice(0, 200),
    departureDate: input.departureDate,
    days: input.days,
    nights: input.nights,
    travelers: input.travelers,
    currency: input.currency,
    pricePerPerson: customerQuote.scenario.pricePerPerson,
    totalPrice: customerQuote.scenario.totalPrice,
    marginRate: Math.round(rawQuote.scenario.actualMarginRate * 10) / 10,
    channel,
  };
}

export function readLocalQuoteLog(): QuoteLogEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(list) ? list.filter(isQuoteLogEntry) : [];
  } catch {
    return [];
  }
}

export function writeLocalQuoteLog(list: QuoteLogEntry[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, MAX_QUOTE_LOG)));
  } catch {
    // 저장소를 쓸 수 없으면 이력 저장만 건너뛴다
  }
}

export function readAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeAuthor(name: string): void {
  try {
    localStorage.setItem(AUTHOR_KEY, name.trim().slice(0, 40));
  } catch {
    // 무시
  }
}

/** 같은 견적을 연달아 여러 문서로 뽑으면 한 줄로 보이게, 1분 안의 같은 조건·같은 가격은 문서 이름만 합친다 */
export function addToLog(list: QuoteLogEntry[], entry: QuoteLogEntry): QuoteLogEntry[] {
  const last = list[0];
  if (
    last &&
    last.author === entry.author &&
    last.destination === entry.destination &&
    last.pricePerPerson === entry.pricePerPerson &&
    last.travelers === entry.travelers &&
    Date.parse(entry.at) - Date.parse(last.at) < 60_000
  ) {
    const docs = new Set([...last.document.split(", "), entry.document]);
    return [{ ...last, document: [...docs].join(", "), at: entry.at }, ...list.slice(1)];
  }
  return [entry, ...list].slice(0, MAX_QUOTE_LOG);
}
