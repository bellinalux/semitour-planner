import type { Inquiry } from "@/lib/inquiry";
import { workspaceId } from "./access";
import { getKv } from "./planStore";

/**
 * 웹 견적 요청함 저장 (견적 요청 페이지·웹 일정표 예약 요청이 같이 쓴다)
 *  - 목록: KV `inquiries:{ws}` 한 칸
 *  - 새로 들어온 요청: 한 건씩 따로 `inquiry-new:{ws}:{id}` 칸에 넣는다.
 *    목록 한 칸을 읽고-고치고-다시 쓰면 고객 두 명이 거의 동시에 보낼 때 한 건이 사라지므로,
 *    새 요청은 서로 겹치지 않는 칸에 넣고 직원이 목록을 열 때 목록으로 합친다.
 */
export const MAX_INQUIRIES = 300;
const listKey = async () => `inquiries:${(await workspaceId()) ?? "local"}`;
const newPrefix = async () => `inquiry-new:${(await workspaceId()) ?? "local"}:`;

function parseList(raw: string | null): Inquiry[] {
  try {
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as Inquiry[]) : [];
  } catch {
    return [];
  }
}

/** 개수 제한 — 처리 안 한 요청은 남기고, 처리한 것 중 오래된 것부터 버린다 (최신순 유지) */
export function capInquiries(list: Inquiry[], max = MAX_INQUIRIES): Inquiry[] {
  if (list.length <= max) return list;
  const open = list.filter((i) => !i.done).length;
  let doneRoom = Math.max(0, max - open);
  return list.filter((i) => !i.done || doneRoom-- > 0);
}

/** 새 요청 한 건 접수. 저장소가 없으면 false */
export async function addInquiry(item: Inquiry): Promise<boolean> {
  const store = await getKv();
  if (!store) return false;
  await store.kv.put(`${await newPrefix()}${item.id}`, JSON.stringify(item));
  return true;
}

/** 목록 읽기 — 따로 들어온 새 요청을 목록에 합치고, 합친 칸은 지운다 */
export async function readInquiries(): Promise<Inquiry[]> {
  const store = await getKv();
  if (!store) return [];
  const key = await listKey();
  const list = parseList(await store.kv.get(key));

  const prefix = await newPrefix();
  const pendingKeys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.kv.list({ prefix, cursor });
    pendingKeys.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  if (pendingKeys.length === 0) return list;

  const known = new Set(list.map((i) => i.id));
  const fresh: Inquiry[] = [];
  for (const k of pendingKeys) {
    const raw = await store.kv.get(k);
    if (!raw) continue;
    try {
      const item = JSON.parse(raw) as Inquiry;
      if (item && typeof item.id === "string" && !known.has(item.id)) {
        fresh.push(item);
        known.add(item.id);
      }
    } catch {
      // 깨진 칸은 버린다
    }
  }
  const merged = capInquiries([...fresh, ...list].sort((a, b) => String(b.at).localeCompare(String(a.at))));
  // 목록에 먼저 쓰고, 그다음 따로 둔 칸을 지운다 — 중간에 실패해도 요청이 사라지지 않는다
  await store.kv.put(key, JSON.stringify(merged));
  await Promise.all(pendingKeys.map((k) => store.kv.delete(k).catch(() => undefined)));
  return merged;
}

/** 목록 저장 (직원이 처리 완료를 바꿀 때) */
export async function writeInquiries(list: Inquiry[]): Promise<boolean> {
  const store = await getKv();
  if (!store) return false;
  await store.kv.put(await listKey(), JSON.stringify(capInquiries(list)));
  return true;
}
