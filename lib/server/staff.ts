import { getKv } from "./planStore";

/**
 * 직원 계정 — 관리자가 이름·권한·개인 접속 코드를 만들어 준다.
 * 코드는 원문을 저장하지 않고 작업공간별 해시만 저장한다. 관리자(공용 접속 코드)는 이 목록과 별개로 항상 들어올 수 있다.
 */
export type StaffRole = "admin" | "staff";

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  codeHash: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

/** 화면에 내려보내는 형태 (코드 해시 제외) */
export type StaffView = Omit<StaffMember, "codeHash">;

export const MIN_CODE_LENGTH = 6;
export const MAX_STAFF = 50;
const CACHE_MS = 30_000;

const keyOf = (ws: string) => `staff:${ws}`;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const hashStaffCode = (ws: string, code: string) => sha256Hex(`semitour-staff:${ws}:${code.trim()}`);

function isMember(v: unknown): v is StaffMember {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && (o.role === "admin" || o.role === "staff") && typeof o.codeHash === "string" && typeof o.active === "boolean";
}

/** 같은 서버 안에서 잠깐 기억해 매 요청마다 저장소를 읽지 않는다 (권한 변경은 최대 30초 뒤 반영) */
function cache(): Map<string, { at: number; list: StaffMember[] }> {
  const g = globalThis as unknown as { __semitourStaff?: Map<string, { at: number; list: StaffMember[] }> };
  return (g.__semitourStaff ??= new Map());
}

export async function listStaff(ws: string, fresh = false): Promise<StaffMember[]> {
  const hit = cache().get(ws);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  const store = await getKv();
  if (!store) return [];
  let list: StaffMember[] = [];
  try {
    const raw = await store.kv.get(keyOf(ws));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    list = Array.isArray(parsed) ? parsed.filter(isMember) : [];
  } catch {
    list = [];
  }
  cache().set(ws, { at: Date.now(), list });
  return list;
}

export async function saveStaff(ws: string, list: StaffMember[]): Promise<void> {
  const store = await getKv();
  if (!store) throw new Error("NO_STORE");
  await store.kv.put(keyOf(ws), JSON.stringify(list));
  cache().set(ws, { at: Date.now(), list });
}

export function toView(member: StaffMember): StaffView {
  const { id, name, role, active, createdAt, lastLoginAt } = member;
  return { id, name, role, active, createdAt, ...(lastLoginAt ? { lastLoginAt } : {}) };
}

export function newStaffId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
