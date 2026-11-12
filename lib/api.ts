/** 대체 AI가 답했을 때 화면에 알리는 이벤트 이름 (detail: { providers, reason }) */
export const AI_PROVIDER_EVENT = "semitour:ai-provider";

/** 서버가 X-AI-Provider 머리글을 붙였으면(대체 AI가 답함) 화면에 알린다 */
export function notifyAiProvider(res: Response): void {
  const providers = res.headers.get("x-ai-provider");
  if (!providers || typeof window === "undefined") return;
  let reason = "";
  try {
    reason = decodeURIComponent(res.headers.get("x-ai-fallback") ?? "");
  } catch {
    reason = "";
  }
  window.dispatchEvent(new CustomEvent(AI_PROVIDER_EVENT, { detail: { providers: providers.split(","), reason } }));
}

/** JSON POST 요청. 서버가 { error: { message } } 형식으로 내려준 오류는 그 메시지로 던진다. */
export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(body),
  });

  notifyAiProvider(res);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `요청에 실패했습니다. (${res.status})`);
  }
  return data as T;
}
