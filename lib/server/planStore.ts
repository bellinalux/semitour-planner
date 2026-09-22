import { planSummary, parsePlan, type PlanIndexEntry, type SavedPlan } from "@/lib/workspace";
import { workerEnv } from "./cfEnv";

/** 우리가 쓰는 KV 기능만 좁혀 둔 형태 */
interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{
    keys: { name: string; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export const MAX_CLOUD_PLANS = 100;
export const MAX_PLAN_BYTES = 2 * 1024 * 1024;
export const PLAN_ID_PATTERN = /^plan-[a-z0-9-]{4,40}$/;

/** 로컬 개발용 임시 저장소. 서버를 껐다 켜면 사라지므로 운영 환경에서는 쓰지 않는다. */
function memoryKv(): KvNamespace {
  const g = globalThis as unknown as { __semitourPlanMemory?: Map<string, { value: string; metadata?: unknown }> };
  const map = (g.__semitourPlanMemory ??= new Map());
  return {
    async get(key) {
      return map.get(key)?.value ?? null;
    },
    async put(key, value, options) {
      map.set(key, { value, metadata: options?.metadata });
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix }) {
      const keys = [...map].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata }));
      return { keys, list_complete: true };
    },
  };
}

/** KV 바인딩(PLANS). 없으면 개발 환경에서만 메모리 저장소를 쓰고, 운영 환경에서는 null. */
export async function getKv(): Promise<{ kv: KvNamespace; kind: "kv" | "memory" } | null> {
  const bound = await workerEnv<KvNamespace>("PLANS");
  if (bound && typeof bound.get === "function") return { kv: bound, kind: "kv" };
  if (process.env.NODE_ENV !== "production") return { kv: memoryKv(), kind: "memory" };
  return null;
}

const keyOf = (ws: string, id: string) => `plan:${ws}:${id}`;

function isEntry(v: unknown): v is PlanIndexEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && typeof o.savedAt === "string" && typeof o.summary === "string";
}

export async function listPlans(kv: KvNamespace, ws: string): Promise<PlanIndexEntry[]> {
  const prefix = `plan:${ws}:`;
  const entries: PlanIndexEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor, limit: 1000 });
    for (const key of page.keys) if (isEntry(key.metadata)) entries.push(key.metadata);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function getPlan(kv: KvNamespace, ws: string, id: string): Promise<SavedPlan | null> {
  const raw = await kv.get(keyOf(ws, id));
  if (!raw) return null;
  try {
    return parsePlan(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function planExists(kv: KvNamespace, ws: string, id: string): Promise<boolean> {
  return (await kv.get(keyOf(ws, id))) !== null;
}

export async function putPlan(kv: KvNamespace, ws: string, plan: SavedPlan): Promise<PlanIndexEntry> {
  const entry: PlanIndexEntry = { id: plan.id, name: plan.name, savedAt: plan.savedAt, summary: planSummary(plan).slice(0, 200) };
  await kv.put(keyOf(ws, plan.id), JSON.stringify(plan), { metadata: entry });
  return entry;
}

export async function removePlan(kv: KvNamespace, ws: string, id: string): Promise<void> {
  await kv.delete(keyOf(ws, id));
}
