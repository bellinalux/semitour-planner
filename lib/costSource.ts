import type { CostKey, CostSource, CostSourceKind, TripInput } from "@/types";

/**
 * 원가 값의 출처 — 직접 입력, 지난 견적, 웹 검색, AI 추정, 고른 항공편·숙소.
 * 견적표와 입력칸에 보여 주고, 인쇄 전 확인 목록에서 "직접 확인하지 않은 값"을 골라내는 데 쓴다.
 */

const LABELS: Record<CostSourceKind, string> = {
  manual: "직접 입력",
  memory: "지난 견적",
  web: "웹 검색",
  ai: "AI 추정",
  flight: "고른 항공편",
  hotel: "고른 숙소",
};

/** 사람이 직접 넣거나 실제 상품을 골라 넣은 값 (나머지는 판매 전 확인이 필요하다) */
export const TRUSTED_SOURCES: CostSourceKind[] = ["manual", "flight", "hotel"];

const shortDate = (iso: string) => (/^\d{4}-(\d{2})-(\d{2})/.exec(iso) ?? []).slice(1).join(".");

export function costSourceLabel(source: CostSource | undefined): string {
  if (!source) return "";
  const date = source.kind === "memory" || source.kind === "web" ? shortDate(source.at) : "";
  return [LABELS[source.kind], source.note, date].filter(Boolean).join(" · ");
}

/** input.costSource에 한 항목의 출처를 덧붙인 패치 */
export function withSource(input: Pick<TripInput, "costSource">, key: CostKey, kind: CostSourceKind, note?: string): Pick<TripInput, "costSource"> {
  return { costSource: { ...input.costSource, [key]: { kind, at: new Date().toISOString(), ...(note ? { note } : {}) } } };
}

export function isCostSource(v: unknown): v is CostSource {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.kind === "string" && o.kind in LABELS && typeof o.at === "string";
}
