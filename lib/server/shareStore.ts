import { sharedItinerarySchema, type SharedItinerary } from "@/lib/shareItinerary";
import { getKv } from "./planStore";

/** 고객용 웹 일정표 저장 — KV(PLANS)의 share: 키, 180일 뒤 사라진다 */
const TTL = 60 * 60 * 24 * 180;
const keyOf = (id: string) => `share:${id}`;
export const SHARE_ID = /^[A-Za-z0-9_-]{16,40}$/;

export function newShareId(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function putShared(id: string, it: SharedItinerary): Promise<boolean> {
  const store = await getKv();
  if (!store) return false;
  await store.kv.put(keyOf(id), JSON.stringify(it), { expirationTtl: TTL });
  return true;
}

export async function getShared(id: string): Promise<SharedItinerary | null> {
  if (!SHARE_ID.test(id)) return null;
  const store = await getKv();
  if (!store) return null;
  const raw = await store.kv.get(keyOf(id));
  if (!raw) return null;
  try {
    const parsed = sharedItinerarySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
