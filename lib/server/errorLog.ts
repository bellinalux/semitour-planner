/**
 * 오류 기록 — 세미투어·상세페이지 스튜디오 화면에서 난 오류와 AI 되풀이 같은 사건을 모아 둔다(PLANS KV, 접두어 err:).
 *  - 같은 오류(앱·종류·메시지·첫 줄 위치가 같음)는 한 건으로 묶고 횟수만 센다 → 같은 오류가 쏟아져도 키가 늘지 않는다
 *  - 30일 뒤 자동으로 지워진다
 *  - 페이지 내용·API 키 같은 사용자 데이터는 받지 않는다(메시지·위치·버전·브라우저만)
 */
import { z } from "zod";
import { getKv } from "./planStore";

const TTL_SECONDS = 60 * 60 * 24 * 30;
export const MAX_ENTRIES = 200;

export const reportSchema = z.object({
  app: z.enum(["semitour", "tourdesign"]),
  kind: z.enum(["error", "rejection", "react", "ai", "server"]).default("error"),
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(2000).default(""),
  where: z.string().max(200).default(""),
  version: z.string().max(40).default(""),
  ua: z.string().max(200).default(""),
});
export type ErrorReport = z.infer<typeof reportSchema>;

export interface ErrorEntry extends ErrorReport {
  id: string;
  count: number;
  first: string;
  last: string;
}
interface Meta { app: string; kind: string; message: string; count: number; last: string; version: string }

interface Kv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { metadata?: unknown; expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ keys: { name: string; metadata?: unknown }[]; list_complete: boolean; cursor?: string }>;
}

async function kv(): Promise<Kv | null> {
  const k = await getKv();
  return k ? (k.kv as unknown as Kv) : null;
}

async function idOf(r: ErrorReport): Promise<string> {
  const firstFrame = r.stack.split("\n").find((l) => /\d+:\d+/.test(l)) ?? "";
  const src = `${r.app}|${r.kind}|${r.message.replace(/\d+/g, "#")}|${firstFrame.replace(/\?[^\s:)]*/g, "")}`;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(src));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

/** 한 건 기록 (같은 오류면 횟수만 올린다) */
export async function recordError(r: ErrorReport): Promise<void> {
  const store = await kv();
  if (!store) return;
  const id = await idOf(r);
  const key = `err:${id}`;
  const now = new Date().toISOString();
  let entry: ErrorEntry;
  try {
    const old = await store.get(key);
    const prev = old ? (JSON.parse(old) as ErrorEntry) : null;
    entry = prev ? { ...prev, ...r, count: prev.count + 1, first: prev.first, last: now, id } : { ...r, id, count: 1, first: now, last: now };
  } catch {
    entry = { ...r, id, count: 1, first: now, last: now };
  }
  const meta: Meta = { app: entry.app, kind: entry.kind, message: entry.message.slice(0, 160), count: entry.count, last: entry.last, version: entry.version };
  await store.put(key, JSON.stringify(entry), { metadata: meta, expirationTtl: TTL_SECONDS });
}

/** 서버 안에서 생긴 사건 기록 (실패해도 원래 일을 막지 않는다) */
export async function recordServerEvent(kind: "ai" | "server", message: string, detail = ""): Promise<void> {
  try {
    await recordError({ app: "semitour", kind, message: message.slice(0, 500), stack: detail.slice(0, 2000), where: "server", version: "", ua: "" });
  } catch (e) {
    console.error("[errorLog] 기록 실패", e);
  }
}

/** 최근 순 목록 (요약만) */
export async function listErrors(): Promise<(Meta & { id: string })[]> {
  const store = await kv();
  if (!store) return [];
  const out: (Meta & { id: string })[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: "err:", cursor, limit: 1000 });
    for (const k of page.keys) {
      const m = k.metadata as Meta | undefined;
      if (m && typeof m.message === "string") out.push({ ...m, id: k.name.slice(4) });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => b.last.localeCompare(a.last)).slice(0, MAX_ENTRIES);
}

export async function getError(id: string): Promise<ErrorEntry | null> {
  const store = await kv();
  if (!store || !/^[a-f0-9]{24}$/.test(id)) return null;
  const raw = await store.get(`err:${id}`);
  try {
    return raw ? (JSON.parse(raw) as ErrorEntry) : null;
  } catch {
    return null;
  }
}

export async function clearErrors(): Promise<number> {
  const store = await kv();
  if (!store) return 0;
  let n = 0;
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: "err:", cursor, limit: 1000 });
    for (const k of page.keys) {
      await store.delete(k.name);
      n++;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return n;
}
