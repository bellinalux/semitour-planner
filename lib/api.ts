/** JSON POST 요청. 서버가 { error: { message } } 형식으로 내려준 오류는 그 메시지로 던진다. */
export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `요청에 실패했습니다. (${res.status})`);
  }
  return data as T;
}
