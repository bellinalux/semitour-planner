import { fetchJson, isRecord } from "./external";

/**
 * 환율(원화 기준). open.er-api.com(ExchangeRate-API 무료 공개 데이터, 하루 1회 갱신)을 쓴다.
 * 무료 이용 조건: 출처 표기, 재배포 금지, 하루 한 번보다 자주 부르지 않기 → 서버 메모리에 6시간 보관한다.
 */
const CACHE_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; updatedAt: string; perKrw: Record<string, number> } | null = null;

async function loadRates() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const res = await fetchJson("https://open.er-api.com/v6/latest/KRW", { headers: { Accept: "application/json" } }, 15_000, "환율");
  if (!res.ok || !isRecord(res.body) || res.body.result !== "success" || !isRecord(res.body.rates)) return cache; // 실패하면 오래된 값이라도 쓴다
  const perKrw: Record<string, number> = {};
  for (const [code, v] of Object.entries(res.body.rates)) if (typeof v === "number" && v > 0) perKrw[code] = v;
  cache = {
    at: Date.now(),
    updatedAt: typeof res.body.time_last_update_utc === "string" ? res.body.time_last_update_utc : "",
    perKrw,
  };
  return cache;
}

/** 1 단위 외화가 몇 원인지. 구하지 못하면 null. KRW는 1. */
export async function krwPerUnit(code: string): Promise<{ rate: number; updatedAt: string } | null> {
  if (code === "KRW") return { rate: 1, updatedAt: "" };
  const data = await loadRates();
  const perKrw = data?.perKrw[code];
  return data && perKrw ? { rate: 1 / perKrw, updatedAt: data.updatedAt } : null;
}
