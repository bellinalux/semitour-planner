import type { Inquiry } from "@/lib/inquiry";
import { workspaceId } from "./access";
import { getKv } from "./planStore";

/** 웹 견적 요청함 저장 — KV `inquiries:{ws}` (견적 요청 페이지·웹 일정표 예약 요청이 같이 쓴다) */
const MAX = 300;
const keyOf = async () => `inquiries:${(await workspaceId()) ?? "local"}`;

export async function readInquiries(): Promise<Inquiry[]> {
  const store = await getKv();
  const raw = store ? await store.kv.get(await keyOf()) : null;
  try {
    const list = raw ? (JSON.parse(raw) as Inquiry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function writeInquiries(list: Inquiry[]): Promise<boolean> {
  const store = await getKv();
  if (!store) return false;
  await store.kv.put(await keyOf(), JSON.stringify(list.slice(0, MAX)));
  return true;
}
