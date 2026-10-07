import type { Session } from "./access";
import { getKv } from "./planStore";

/**
 * 열람·변경 기록 — 고객 정보(예약)를 누가 보고 바꿨는지, 직원 계정·회사 정보를 누가 바꿨는지, 누가 로그인했는지 남긴다.
 * 같은 사람이 같은 것을 10분 안에 다시 열람하면 한 번만 남긴다(목록을 여러 번 여는 것까지 쌓이지 않게).
 */
export interface AuditEntry {
  at: string;
  who: string;
  role: string;
  action: string;
  target: string;
}

const MAX_AUDIT = 500;
const VIEW_DEDUP_MS = 10 * 60 * 1000;

function recentViews(): Map<string, number> {
  const g = globalThis as unknown as { __semitourAuditViews?: Map<string, number> };
  return (g.__semitourAuditViews ??= new Map());
}

export async function readAudit(ws: string): Promise<AuditEntry[]> {
  const store = await getKv();
  if (!store) return [];
  try {
    const raw = await store.kv.get(`audit:${ws}`);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

/** 기록 한 건. 저장에 실패해도 원래 작업은 막지 않는다 */
export async function audit(ws: string | null, who: Pick<Session, "name" | "role"> | null, action: string, target = "", options: { view?: boolean } = {}): Promise<void> {
  if (!ws) return;
  const name = who?.name || "알 수 없음";
  if (options.view) {
    const key = `${ws}|${name}|${action}|${target}`;
    const last = recentViews().get(key);
    if (last && Date.now() - last < VIEW_DEDUP_MS) return;
    recentViews().set(key, Date.now());
  }
  const store = await getKv();
  if (!store) return;
  const entry: AuditEntry = { at: new Date().toISOString(), who: name, role: who?.role ?? "", action, target: target.slice(0, 120) };
  try {
    const list = await readAudit(ws);
    await store.kv.put(`audit:${ws}`, JSON.stringify([entry, ...list].slice(0, MAX_AUDIT)));
  } catch {
    // 기록 실패는 무시
  }
}
