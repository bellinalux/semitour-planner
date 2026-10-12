/** 이 브라우저에서 만든 웹 일정표(공유 링크) — 상품 이름별 id (ShareLinkBox가 저장한다) */
export const SHARE_LINKS_KEY = "semitour-planner:shareLinks";

export function readShareLinks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SHARE_LINKS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** 이 상품의 웹 일정표 주소 (만든 적이 없으면 null) — 인쇄 문서의 QR 코드에 넣는다 */
export function shareUrlOf(planKey: string): string | null {
  if (typeof window === "undefined") return null;
  const id = readShareLinks()[planKey];
  return id ? `${window.location.origin}/t/${id}` : null;
}
