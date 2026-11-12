/**
 * 접근 코드 무차별 대입 방지 — 로그인과 스튜디오 접근 코드(X-Studio-Code) 확인이 함께 쓴다.
 *
 * 두 겹으로 막는다.
 *  1) 시도 제한: 코드를 확인할 때마다 IP당 1분 ATTEMPTS_PER_MINUTE회까지 (맞는 코드여도 센다 —
 *     넘으면 코드가 맞는지조차 알려 주지 않는다)
 *  2) 잠금: 틀린 코드가 IP당 1분 FAILS_PER_MINUTE회를 넘으면 그 IP를 LOCK_SECONDS 동안 잠근다
 *
 * Cloudflare에서는 Rate Limiting 바인딩(AUTH_RATE_LIMITER, AUTH_FAIL_LIMITER)과 KV(잠금 기록)를 써서
 * 여러 서버 인스턴스가 같은 횟수를 본다. 서버 메모리는 인스턴스마다 따로라 그것만으로는 막히지 않는다.
 * 바인딩이 없는 로컬 개발에서는 메모리로 대신한다.
 */
import { workerEnv } from "./cfEnv";
import { getKv } from "./planStore";
import { clientKey, memoryAllow } from "./rateLimit";

export const ATTEMPTS_PER_MINUTE = 120;
export const FAILS_PER_MINUTE = 10;
export const LOCK_SECONDS = 10 * 60;

interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

async function binding(name: string): Promise<RateLimiterBinding | null> {
  const b = await workerEnv<RateLimiterBinding>(name);
  return b && typeof b.limit === "function" ? b : null;
}

/** 이 인스턴스가 알고 있는 잠금 (KV를 매번 읽지 않게) */
function locks(): Map<string, number> {
  const g = globalThis as unknown as { __semitourAuthLocks?: Map<string, number> };
  return (g.__semitourAuthLocks ??= new Map());
}

const lockKey = (ip: string) => `authlock:${ip}`;

async function isLocked(ip: string): Promise<boolean> {
  const until = locks().get(ip);
  if (until !== undefined) {
    if (until > Date.now()) return true;
    locks().delete(ip);
  }
  const store = await getKv();
  const raw = store ? await store.kv.get(lockKey(ip)).catch(() => null) : null;
  const stored = raw ? Number(raw) : 0;
  if (stored > Date.now()) {
    locks().set(ip, stored);
    return true;
  }
  return false;
}

async function lock(ip: string): Promise<void> {
  const until = Date.now() + LOCK_SECONDS * 1000;
  locks().set(ip, until);
  if (locks().size > 5000) for (const [k, t] of locks()) if (t <= Date.now()) locks().delete(k);
  const store = await getKv();
  await store?.kv.put(lockKey(ip), String(until), { expirationTtl: LOCK_SECONDS }).catch(() => undefined);
}

/**
 * 코드를 확인하기 **전에** 부른다. 잠겨 있거나 시도가 너무 잦으면 true — 이때는 코드를 확인하지 말고 429로 돌려준다.
 * (이번 시도를 1회로 센다)
 */
export async function authBlocked(request: Request): Promise<boolean> {
  const ip = clientKey(request);
  if (await isLocked(ip)) return true;
  const b = await binding("AUTH_RATE_LIMITER");
  const ok = b ? (await b.limit({ key: ip })).success : memoryAllow(`auth:${ip}`, ATTEMPTS_PER_MINUTE);
  return !ok;
}

/** 틀린 코드였을 때 부른다. 1분에 FAILS_PER_MINUTE회를 넘으면 그 IP를 잠근다 */
export async function authFailed(request: Request): Promise<void> {
  const ip = clientKey(request);
  const b = await binding("AUTH_FAIL_LIMITER");
  const ok = b ? (await b.limit({ key: ip })).success : memoryAllow(`authfail:${ip}`, FAILS_PER_MINUTE);
  if (!ok) await lock(ip);
}

export const AUTH_BLOCKED_MESSAGE = "접근 코드 확인 시도가 너무 많아 잠시 막았습니다. 10분쯤 뒤에 다시 시도해 주세요.";
/** 429 응답에 붙이는 Retry-After (초) */
export const AUTH_RETRY_AFTER = String(LOCK_SECONDS);
