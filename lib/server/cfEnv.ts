/**
 * Cloudflare Worker 바인딩(KV, Rate Limiting 등)을 이름으로 읽는다. Worker 밖(로컬 개발)이거나
 * 그 이름의 바인딩이 없으면 null.
 */
export async function workerEnv<T>(name: string): Promise<T | null> {
  try {
    // 일반 번들러가 해석하지 못하도록 이름을 나눠서 실행 시점에만 불러온다
    const specifier = "cloudflare:" + "workers";
    const mod = (await import(/* @vite-ignore */ specifier)) as { env?: Record<string, unknown> };
    const binding = mod.env?.[name];
    return binding ? (binding as T) : null;
  } catch {
    return null;
  }
}
