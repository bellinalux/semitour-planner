import type { CostKey, CurrencyCode, TripInput } from "@/types";

const KEY = "semitour-planner:cost-memory:v1";
const MAX_ENTRIES = 40;

/** 여행지별로 기억해 두는 원가 */
const MEMORY_FIELDS = ["vehicleCostPerDay", "guideCostPerDay", "otherFixedCost", "lodgingRatePerNight", "flightPricePerPerson", "cityTaxPerPersonPerNight"] as const;
type MemoryField = (typeof MEMORY_FIELDS)[number];

const FIELD_LABELS: Record<MemoryField, string> = {
  vehicleCostPerDay: "차량비",
  guideCostPerDay: "가이드비",
  otherFixedCost: "기타 고정비",
  lodgingRatePerNight: "1박 요금",
  flightPricePerPerson: "항공료",
  cityTaxPerPersonPerNight: "숙박세",
};

const FIELD_STATUS: Partial<Record<MemoryField, CostKey>> = {
  vehicleCostPerDay: "vehicle",
  guideCostPerDay: "guide",
  otherFixedCost: "other",
  lodgingRatePerNight: "lodging",
  flightPricePerPerson: "flight",
};

export interface CostMemoryEntry {
  destination: string;
  currency: CurrencyCode;
  savedAt: string;
  values: Partial<Record<MemoryField, number>>;
}

/** "다낭, 베트남" → "다낭" 처럼 여행지를 비교용 키로 만든다 */
function destinationKey(destination: string): string {
  return destination.split(/[,/·]/)[0].replace(/\s+/g, "").toLowerCase();
}

function readAll(): Record<string, CostMemoryEntry> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, CostMemoryEntry>) : {};
  } catch {
    return {};
  }
}

/** 견적에 넣은 원가 중 0이 아닌 값을 여행지별로 기억한다 (같은 여행지는 최신 값으로 덮어쓴다) */
export function rememberCosts(input: TripInput): void {
  const key = destinationKey(input.destination);
  if (!key) return;
  const values: Partial<Record<MemoryField, number>> = {};
  for (const field of MEMORY_FIELDS) if (input[field] > 0) values[field] = input[field];
  if (Object.keys(values).length === 0) return;

  const all = readAll();
  const prev = all[key];
  if (prev && prev.currency === input.currency && JSON.stringify(prev.values) === JSON.stringify(values)) return;
  all[key] = { destination: input.destination.trim(), currency: input.currency, savedAt: new Date().toISOString(), values };
  // 오래된 여행지부터 지워 크기를 제한한다
  const entries = Object.entries(all).sort((a, b) => b[1].savedAt.localeCompare(a[1].savedAt)).slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // 무시
  }
}

export function recallCosts(destination: string, currency: CurrencyCode): CostMemoryEntry | null {
  const entry = readAll()[destinationKey(destination)];
  return entry && entry.currency === currency ? entry : null;
}

/**
 * 지난 견적에서 기억한 원가로, 지금 0으로 비어 있는 칸만 채운다. 채운 값은 "추정"으로 표시한다.
 * 기억한 값이 없거나 채울 칸이 없으면 null.
 */
export function fillFromMemory(input: TripInput): { patch: Partial<TripInput>; applied: string[]; savedAt: string } | null {
  const entry = recallCosts(input.destination, input.currency);
  if (!entry) return null;
  const patch: Partial<TripInput> = {};
  const applied: string[] = [];
  const costStatus = { ...input.costStatus };
  for (const field of MEMORY_FIELDS) {
    const value = entry.values[field];
    if (!value || input[field] > 0) continue;
    patch[field] = value;
    applied.push(FIELD_LABELS[field]);
    const statusKey = FIELD_STATUS[field];
    if (statusKey) costStatus[statusKey] = "estimated";
  }
  if (applied.length === 0) return null;
  return { patch: { ...patch, costStatus }, applied, savedAt: entry.savedAt };
}
