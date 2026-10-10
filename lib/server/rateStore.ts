import { knowledgeKey } from "@/lib/knowledge";
import { emptyRates, type CityRates } from "@/lib/rateBook";
import { workspaceId } from "./access";
import { getKv } from "./planStore";

/**
 * 회사 요금표 저장 — 작업공간(회사)별·도시별 문서 (KV `rates:{ws}:{도시}`), 도시 목록 `rates:{ws}:_cities`.
 * 업체 실제 요금이 들어 있어 회사 밖으로는 공유하지 않는다.
 */

async function ws(): Promise<string> {
  return (await workspaceId()) ?? "local";
}
const docKey = (w: string, city: string) => `rates:${w}:${knowledgeKey(city)}`;
const indexKey = (w: string) => `rates:${w}:_cities`;

export async function getRates(city: string): Promise<CityRates> {
  const store = await getKv();
  if (!store || !knowledgeKey(city)) return emptyRates(city);
  const raw = await store.kv.get(docKey(await ws(), city));
  try {
    const d = raw ? (JSON.parse(raw) as CityRates) : null;
    return d ? { ...emptyRates(city), ...d, hotels: Array.isArray(d.hotels) ? d.hotels : [], ground: Array.isArray(d.ground) ? d.ground : [] } : emptyRates(city);
  } catch {
    return emptyRates(city);
  }
}

export async function listRateCities(): Promise<{ city: string; hotels: number; ground: number; updatedAt: string }[]> {
  const store = await getKv();
  if (!store) return [];
  const raw = await store.kv.get(indexKey(await ws()));
  try {
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function putRates(doc: CityRates): Promise<void> {
  const store = await getKv();
  if (!store || !knowledgeKey(doc.city)) return;
  const w = await ws();
  await store.kv.put(docKey(w, doc.city), JSON.stringify(doc));
  const list = (await listRateCities()).filter((c) => knowledgeKey(c.city) !== knowledgeKey(doc.city));
  await store.kv.put(indexKey(w), JSON.stringify([{ city: doc.city, hotels: doc.hotels.length, ground: doc.ground.length, updatedAt: doc.updatedAt }, ...list].slice(0, 300)));
}

/** 읽어 고치고 저장 (실패해도 본 작업은 계속) */
export async function updateRates(city: string, fn: (d: CityRates) => CityRates): Promise<CityRates | null> {
  try {
    const cur = await getRates(city);
    const next = fn(cur);
    if (next !== cur) await putRates(next);
    return next;
  } catch (err) {
    console.error("[rates]", err instanceof Error ? err.message : err);
    return null;
  }
}
