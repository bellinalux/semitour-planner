import { emptyKit, guideScriptSchema, phraseSchema, withDefaultBasics, type GuideBasics, type GuideCityEntry, type GuideCityKit } from "@/lib/guideBook";
import { knowledgeKey } from "@/lib/knowledge";
import { workspaceId } from "./access";
import { getKv } from "./planStore";

/**
 * 가이드 해설집 저장 — 작업공간(회사)별·도시별 문서 하나 (KV `gb:{ws}:{도시}`), 도시 목록 `gb:{ws}:_cities`, 교육 자료 `gb:{ws}:_basics`.
 * 회사 밖으로는 공유하지 않는다. 기한 없이 보관.
 */

async function wsKey(): Promise<string> {
  return (await workspaceId()) ?? "local";
}
const docKey = (ws: string, city: string) => `gb:${ws}:${knowledgeKey(city)}`;
const indexKey = (ws: string) => `gb:${ws}:_cities`;
const basicsKey = (ws: string) => `gb:${ws}:_basics`;

export async function getKit(city: string): Promise<GuideCityKit> {
  const store = await getKv();
  if (!store || !knowledgeKey(city)) return emptyKit(city);
  const raw = await store.kv.get(docKey(await wsKey(), city));
  if (!raw) return emptyKit(city);
  try {
    const d = JSON.parse(raw) as Partial<GuideCityKit>;
    const scripts = (Array.isArray(d.scripts) ? d.scripts : []).flatMap((s) => {
      const p = guideScriptSchema.safeParse(s);
      return p.success ? [p.data] : [];
    });
    const phrases = (Array.isArray(d.phrases) ? d.phrases : []).flatMap((s) => {
      const p = phraseSchema.safeParse(s);
      return p.success ? [p.data] : [];
    });
    return { city: d.city || city, scripts, phrases, updatedAt: d.updatedAt ?? "" };
  } catch {
    return emptyKit(city);
  }
}

export async function listKits(): Promise<GuideCityEntry[]> {
  const store = await getKv();
  if (!store) return [];
  const raw = await store.kv.get(indexKey(await wsKey()));
  try {
    const list = raw ? (JSON.parse(raw) as GuideCityEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function putKit(kit: GuideCityKit): Promise<boolean> {
  const store = await getKv();
  if (!store || !knowledgeKey(kit.city)) return false;
  const ws = await wsKey();
  const doc = { ...kit, updatedAt: kit.updatedAt || new Date().toISOString() };
  await store.kv.put(docKey(ws, kit.city), JSON.stringify(doc));
  const entry: GuideCityEntry = { city: kit.city, scripts: kit.scripts.length, reviewed: kit.scripts.filter((s) => s.status === "reviewed").length, updatedAt: doc.updatedAt };
  const list = (await listKits()).filter((c) => knowledgeKey(c.city) !== knowledgeKey(kit.city));
  await store.kv.put(indexKey(ws), JSON.stringify([entry, ...list].slice(0, 300)));
  return true;
}

/** 도시 해설집을 읽어 고치고 저장 */
export async function updateKit(city: string, fn: (kit: GuideCityKit) => GuideCityKit): Promise<GuideCityKit> {
  const cur = await getKit(city);
  const next = fn(cur);
  if (next !== cur) await putKit(next);
  return next;
}

export async function getBasics(): Promise<GuideBasics> {
  const store = await getKv();
  if (!store) return withDefaultBasics(null);
  const raw = await store.kv.get(basicsKey(await wsKey()));
  try {
    return withDefaultBasics(raw ? (JSON.parse(raw) as GuideBasics) : null);
  } catch {
    return withDefaultBasics(null);
  }
}

export async function putBasics(b: GuideBasics): Promise<boolean> {
  const store = await getKv();
  if (!store) return false;
  await store.kv.put(basicsKey(await wsKey()), JSON.stringify(b));
  return true;
}

/** 서버 저장소가 없으면 (운영 환경에서 KV 미연결) 저장하지 못한다 */
export async function hasStore(): Promise<boolean> {
  return (await getKv()) !== null;
}
