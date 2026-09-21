/** 외부 시세 API(항공·투어) 호출에 쓰는 공용 도구 */

export class ExternalError extends Error {
  constructor(
    public code: "NO_KEY" | "UPSTREAM" | "TIMEOUT" | "NOT_FOUND" | "BAD_OUTPUT",
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * 환경변수(Secret)를 읽는다. 대시보드에 붙여넣다가 딸려 오기 쉬운 따옴표, 공백, 줄바꿈,
 * "이름=" 글자를 걷어낸다. 없으면 null.
 */
export function readSecret(name: string): string | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(new RegExp(`^${name}\\s*=\\s*`), "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
  return cleaned || null;
}

/** JSON을 돌려주는 외부 API 호출. 상태 코드와 본문은 호출한 쪽이 해석하도록 그대로 돌려준다. */
export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  serviceName: string,
): Promise<{ status: number; ok: boolean; body: unknown }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const body: unknown = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ExternalError("TIMEOUT", `${serviceName} 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.`, 504);
    }
    throw new ExternalError("UPSTREAM", `${serviceName} 서버에 연결하지 못했습니다.`, 502);
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}
