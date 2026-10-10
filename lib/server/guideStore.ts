import { guideSheetSchema, type GuideLog, type GuideSheet, type GuideState } from "@/lib/guideSheet";
import { getKv } from "./planStore";
import { SHARE_ID } from "./shareStore";

/** 가이드 운영 페이지 저장 — KV(PLANS)의 guide: 키, 1년. 일정(sheet)·진행 체크(progress)·현장 기록(logs)을 따로 둔다 */
const TTL = 60 * 60 * 24 * 365;
const sheetKey = (id: string) => `guide:${id}:sheet`;
const stateKey = (id: string) => `guide:${id}:state`;
const progressKey = (id: string) => `guide:${id}:progress`;
const logsKey = (id: string) => `guide:${id}:logs`;
const MAX_LOGS = 200;

async function kv() {
  return (await getKv())?.kv ?? null;
}

export async function putGuideSheet(id: string, sheet: GuideSheet): Promise<boolean> {
  const store = await kv();
  if (!store) return false;
  await store.put(sheetKey(id), JSON.stringify(sheet), { expirationTtl: TTL });
  return true;
}

export async function getGuideSheet(id: string): Promise<GuideSheet | null> {
  if (!SHARE_ID.test(id)) return null;
  const store = await kv();
  const raw = store ? await store.get(sheetKey(id)) : null;
  if (!raw) return null;
  try {
    const p = guideSheetSchema.safeParse(JSON.parse(raw));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

/** 진행 체크와 기록은 칸을 나눈다 — 체크·기록을 거의 동시에 보내도 서로 덮어쓰지 않게 */
async function readJson<T>(key: string, fallback: T, ok: (v: unknown) => boolean): Promise<T> {
  const store = await kv();
  const raw = store ? await store.get(key) : null;
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    return ok(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

async function putJson(key: string, value: unknown) {
  const store = await kv();
  if (store) await store.put(key, JSON.stringify(value), { expirationTtl: TTL });
}

const isRecord = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);

/** 예전 한 칸(state)에 저장한 것도 읽는다 */
async function legacy(id: string): Promise<Partial<GuideState>> {
  return readJson<Partial<GuideState>>(stateKey(id), {}, isRecord);
}

async function getProgress(id: string): Promise<GuideState["progress"]> {
  const p = await readJson<GuideState["progress"] | null>(progressKey(id), null, isRecord);
  if (p) return p;
  const old = (await legacy(id)).progress;
  return isRecord(old) ? old! : {};
}

async function getLogs(id: string): Promise<GuideLog[]> {
  const l = await readJson<GuideLog[] | null>(logsKey(id), null, Array.isArray);
  if (l) return l;
  const old = (await legacy(id)).logs;
  return Array.isArray(old) ? old : [];
}

export async function getGuideState(id: string): Promise<GuideState> {
  if (!SHARE_ID.test(id)) return { progress: {}, logs: [] };
  const [progress, logs] = await Promise.all([getProgress(id), getLogs(id)]);
  return { progress, logs };
}

export async function setProgress(id: string, key: string, done: boolean): Promise<GuideState> {
  const progress = { ...(await getProgress(id)) };
  if (done) progress[key] = new Date().toISOString();
  else delete progress[key];
  await putJson(progressKey(id), progress);
  return { progress, logs: await getLogs(id) };
}

export async function addLog(id: string, log: GuideLog): Promise<GuideState> {
  const logs = [...(await getLogs(id)), log].slice(-MAX_LOGS);
  await putJson(logsKey(id), logs);
  return { progress: await getProgress(id), logs };
}
