import { notifyTeamChange, TEAM_KEYS } from "@/lib/teamSync";
import type { TripInput } from "@/types";

const KEY = TEAM_KEYS.defaults;

/** 견적마다 다시 고칠 필요가 없는 회사 기본값. 새 견적·초기화 때 자동으로 들어간다. */
const DEFAULT_KEYS = [
  "targetMarginRate",
  "minMarginRate",
  "contingencyRate",
  "cardFeeRate",
  "tipPerPerson",
  "insurancePerPerson",
  "guestsPerUnit",
  "lodgingType",
  "hotelGrade",
  "originCity",
  "channels",
  "channelPriceMode",
  "childPriceRate",
  "infantPriceRate",
  "fxBufferRate",
] as const satisfies readonly (keyof TripInput)[];

export const DEFAULT_LABELS = "마진·예비비·카드 수수료·팁·보험·1실 인원·숙소 유형·호텔 등급·출발지·판매 채널·아동/유아 요금·환율 버퍼";

export function loadPricingDefaults(): Partial<TripInput> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { values?: Partial<TripInput> };
    return parsed.values && typeof parsed.values === "object" ? parsed.values : null;
  } catch {
    return null;
  }
}

export function pricingDefaultsSavedAt(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? ((JSON.parse(raw) as { savedAt?: string }).savedAt ?? null) : null;
  } catch {
    return null;
  }
}

export function savePricingDefaults(input: TripInput): void {
  const values: Record<string, unknown> = {};
  for (const key of DEFAULT_KEYS) values[key] = structuredClone(input[key]);
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: new Date().toISOString(), values }));
    notifyTeamChange("defaults");
  } catch {
    // 저장소를 쓸 수 없는 환경이면 기본값 저장만 건너뛴다
  }
}

export function clearPricingDefaults(): void {
  try {
    localStorage.removeItem(KEY);
    notifyTeamChange("defaults");
  } catch {
    // 무시
  }
}
