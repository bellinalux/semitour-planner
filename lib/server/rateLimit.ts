/**
 * 호출 횟수 제한.
 *  - Cloudflare 배포 환경: wrangler.jsonc에 선언한 Rate Limiting 바인딩(AI_RATE_LIMITER)을 쓴다.
 *  - 바인딩이 없는 환경(로컬 개발): 서버 메모리에 기록하는 간단한 제한으로 대신한다.
 * 정확한 사용량 계산기가 아니라 남용을 막는 용도다.
 */

interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** 1분에 허용하는 AI 호출 수 (한 번의 "일정·견적 생성"이 API를 2번 부른다) */
export const AI_CALLS_PER_MINUTE = 10;
/** 접근 코드 입력 시도는 더 엄격하게 제한한다 */
export const LOGIN_ATTEMPTS_PER_MINUTE = 6;

const memory = new Map<string, number[]>();

function memoryAllow(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (memory.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    memory.set(key, recent);
    return false;
  }
  recent.push(now);
  memory.set(key, recent);
  // 오래 쓰면 키가 쌓이므로 가끔 정리한다
  if (memory.size > 5000) {
    for (const [k, times] of memory) if (times.every((t) => now - t >= windowMs)) memory.delete(k);
  }
  return true;
}

/** Cloudflare Worker 바인딩을 읽는다. Worker가 아니면 null. */
async function workerBinding(name: string): Promise<RateLimiterBinding | null> {
  try {
    // 일반 번들러가 해석하지 못하도록 이름을 나눠서 실행 시점에만 불러온다
    const specifier = "cloudflare:" + "workers";
    const mod = (await import(/* @vite-ignore */ specifier)) as { env?: Record<string, unknown> };
    const binding = mod.env?.[name] as RateLimiterBinding | undefined;
    return binding && typeof binding.limit === "function" ? binding : null;
  } catch {
    return null;
  }
}

export function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

/** AI 호출 허용 여부 */
export async function allowAiCall(request: Request): Promise<boolean> {
  const key = clientKey(request);
  const binding = await workerBinding("AI_RATE_LIMITER");
  if (binding) return (await binding.limit({ key })).success;
  return memoryAllow(`ai:${key}`, AI_CALLS_PER_MINUTE);
}

/** 접근 코드 입력 시도 허용 여부 (무차별 대입 방지) */
export function allowLoginAttempt(request: Request): boolean {
  return memoryAllow(`login:${clientKey(request)}`, LOGIN_ATTEMPTS_PER_MINUTE);
}
