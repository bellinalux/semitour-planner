import { emptyCity, knowledgeKey, type CityKnowledge } from "@/lib/knowledge";
import { bumpMetrics, type MetricsPatch, type MetricsRecord } from "@/lib/knowledgeMetrics";
import { workspaceId } from "./access";
import { getKv } from "./planStore";

/**
 * 지식 창고 저장 — 작업공간(회사)별·도시별 문서 하나 (KV `kn:{ws}:{도시}`), 도시 목록은 `kn:{ws}:_cities`.
 * 조회는 늘 도시 단위라 문서 하나로 충분하다. 자료가 아주 많아지면 이 파일만 D1 같은 DB로 바꾸면 된다.
 * 회사 밖으로는 공유하지 않는다. 기한 없이 보관 (조사 날짜로 오래된 정보는 다시 조사).
 */

export interface CityIndexEntry {
  city: string;
  places: number;
  courses: number;
  researchedAt: string;
  learnedCount: number;
  updatedAt: string;
}

async function wsKey(): Promise<string> {
  return (await workspaceId()) ?? "local";
}
const docKey = (ws: string, city: string) => `kn:${ws}:${knowledgeKey(city)}`;
const indexKey = (ws: string) => `kn:${ws}:_cities`;
const metricsKey = (ws: string) => `kn:${ws}:_metrics`;

export async function getMetrics(): Promise<MetricsRecord> {
  const store = await getKv();
  if (!store) return {};
  const raw = await store.kv.get(metricsKey(await wsKey()));
  try {
    const r = raw ? (JSON.parse(raw) as MetricsRecord) : {};
    return typeof r === "object" && r !== null && !Array.isArray(r) ? r : {};
  } catch {
    return {};
  }
}

/** 발전 지표 더하기 (실패해도 본 작업에는 영향 없음) */
export async function bumpMetric(patch: MetricsPatch): Promise<void> {
  try {
    const store = await getKv();
    if (!store) return;
    await store.kv.put(metricsKey(await wsKey()), JSON.stringify(bumpMetrics(await getMetrics(), patch)));
  } catch {
    /* 지표는 놓쳐도 된다 */
  }
}

export async function getCity(city: string): Promise<CityKnowledge> {
  const store = await getKv();
  if (!store || !knowledgeKey(city)) return emptyCity(city);
  const raw = await store.kv.get(docKey(await wsKey(), city));
  if (!raw) return emptyCity(city);
  try {
    const d = JSON.parse(raw) as CityKnowledge;
    return { ...emptyCity(city), ...d, places: Array.isArray(d.places) ? d.places : [], courses: Array.isArray(d.courses) ? d.courses : [], needs: Array.isArray(d.needs) ? d.needs : [], fieldNotes: Array.isArray(d.fieldNotes) ? d.fieldNotes : [] };
  } catch {
    return emptyCity(city);
  }
}

export async function listCities(): Promise<CityIndexEntry[]> {
  const store = await getKv();
  if (!store) return [];
  const raw = await store.kv.get(indexKey(await wsKey()));
  try {
    const list = raw ? (JSON.parse(raw) as CityIndexEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function putCity(doc: CityKnowledge): Promise<boolean> {
  const store = await getKv();
  if (!store || !knowledgeKey(doc.city)) return false;
  const ws = await wsKey();
  await store.kv.put(docKey(ws, doc.city), JSON.stringify(doc));
  const entry: CityIndexEntry = { city: doc.city, places: doc.places.length, courses: doc.courses.length, researchedAt: doc.researchedAt, learnedCount: doc.learnedCount, updatedAt: doc.updatedAt || new Date().toISOString() };
  const list = (await listCities()).filter((c) => knowledgeKey(c.city) !== knowledgeKey(doc.city));
  await store.kv.put(indexKey(ws), JSON.stringify([entry, ...list].slice(0, 300)));
  return true;
}

export async function deleteCity(city: string): Promise<void> {
  const store = await getKv();
  if (!store) return;
  const ws = await wsKey();
  await store.kv.delete(docKey(ws, city));
  const list = (await listCities()).filter((c) => knowledgeKey(c.city) !== knowledgeKey(city));
  await store.kv.put(indexKey(ws), JSON.stringify(list));
}

/** 도시 문서를 읽어 고치고 저장 */
export async function updateCity(city: string, fn: (doc: CityKnowledge) => CityKnowledge): Promise<CityKnowledge> {
  const cur = await getCity(city);
  const next = fn(cur);
  if (next !== cur) await putCity(next);
  return next;
}
