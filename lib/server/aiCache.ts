import { workerEnv } from "./cfEnv";
import { getKv } from "./planStore";

/**
 * AI·웹 조사 결과 캐시 — 같은 요청(여행지·인원·통화 등)이 다시 오면 Gemini를 부르지 않고 바로 돌려준다.
 * 1) 같은 서버 안의 메모리(가장 빠름) → 2) KV(AI_CACHE, 없으면 일정 보관함 KV — 서버를 다시 켜도, 다른 서버에서도 공유) 순으로 찾는다.
 * 검색 근거가 없는 결과처럼 믿기 어려운 값은 keep()으로 걸러 저장하지 않는다.
 */

interface Entry {
  at: number;
  value: unknown;
}

type Kv = NonNullable<Awaited<ReturnType<typeof getKv>>>["kv"] & {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

const MEMORY_LIMIT = 200;
const KV_MIN_TTL = 60; // KV는 60초보다 짧은 만료를 받지 않는다

function memory(): Map<string, Entry> {
  const g = globalThis as unknown as { __semitourAiCache?: Map<string, Entry> };
  return (g.__semitourAiCache ??= new Map());
}

/** 요청 내용을 짧은 키로 (키 순서가 달라도 같은 요청이면 같은 키) */
async function digest(value: unknown): Promise<string> {
  const stable = JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable));
  return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cached<T>(scope: string, request: unknown, ttlSeconds: number, compute: () => Promise<T>, keep: (value: T) => boolean = () => true): Promise<T> {
  const key = `ai:${scope}:${await digest(request)}`;
  const now = Date.now();
  const mem = memory();
  const hit = mem.get(key);
  if (hit && now - hit.at < ttlSeconds * 1000) return hit.value as T;

  const store = (await workerEnv<Kv>("AI_CACHE")) ?? ((await getKv().catch(() => null))?.kv as Kv | undefined);
  if (store) {
    try {
      const raw = await store.get(key);
      if (raw) {
        const entry = JSON.parse(raw) as Entry;
        if (now - entry.at < ttlSeconds * 1000) {
          mem.set(key, entry);
          return entry.value as T;
        }
      }
    } catch {
      // 캐시를 못 읽어도 새로 계산하면 된다
    }
  }

  const value = await compute();
  if (keep(value)) {
    const entry: Entry = { at: now, value };
    if (mem.size >= MEMORY_LIMIT) mem.delete(mem.keys().next().value as string);
    mem.set(key, entry);
    if (store) await store.put(key, JSON.stringify(entry), { expirationTtl: Math.max(KV_MIN_TTL, ttlSeconds) }).catch(() => undefined);
  }
  return value;
}

export const HOUR = 60 * 60;
export const DAY = 24 * HOUR;
