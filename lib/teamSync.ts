/**
 * 팀 공용 데이터(회사 기본값, 여행지별 원가 기억)를 서버와 맞춘다.
 * 브라우저 저장(localStorage)을 그대로 쓰고, 서버를 쓸 수 있을 때만 서버와 주고받는다 — 서버가 없어도 지금처럼 동작한다.
 * 두 쪽이 다르면 더 최근에 저장한 값을 쓴다(원가 기억은 여행지별로 비교).
 */

export type TeamKind = "defaults" | "cost-memory";

export const TEAM_KEYS: Record<TeamKind, string> = {
  defaults: "semitour-planner:defaults:v1",
  "cost-memory": "semitour-planner:cost-memory:v1",
};

const CHANGE_EVENT = "semitour:team-change";

/** 브라우저에 저장한 팀 데이터가 바뀌었음을 알린다 (useTeamSync가 받아 서버에 올린다) */
export function notifyTeamChange(kind: TeamKind): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<TeamKind>(CHANGE_EVENT, { detail: kind }));
}

export function onTeamChange(listener: (kind: TeamKind) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<TeamKind>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

type Stamped = { savedAt?: string };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const stamp = (v: unknown) => (isObj(v) && typeof (v as Stamped).savedAt === "string" ? (v as Stamped).savedAt! : "");

/**
 * 두 쪽을 합친 값과, 서버에 다시 올려야 하는지(브라우저 쪽이 더 최신인 부분이 있는지)를 돌려준다.
 * defaults: 통째로 더 최근 것 · cost-memory: 여행지별로 더 최근 것
 */
export function mergeTeamData(kind: TeamKind, local: unknown, server: unknown): { merged: unknown; pushBack: boolean } {
  if (kind === "defaults") {
    if (!isObj(server)) return { merged: local, pushBack: isObj(local) };
    if (!isObj(local)) return { merged: server, pushBack: false };
    return stamp(local) > stamp(server) ? { merged: local, pushBack: true } : { merged: server, pushBack: false };
  }
  const l = isObj(local) ? local : {};
  const s = isObj(server) ? server : {};
  const merged: Record<string, unknown> = { ...s };
  let pushBack = false;
  for (const [key, entry] of Object.entries(l)) {
    if (!(key in s) || stamp(entry) > stamp(s[key])) {
      merged[key] = entry;
      pushBack = true;
    }
  }
  return { merged, pushBack };
}

export function readTeamLocal(kind: TeamKind): unknown {
  try {
    const raw = localStorage.getItem(TEAM_KEYS[kind]);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeTeamLocal(kind: TeamKind, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(TEAM_KEYS[kind]);
    else localStorage.setItem(TEAM_KEYS[kind], JSON.stringify(value));
  } catch {
    // 무시
  }
}

/** 서버 값. 서버 저장을 쓸 수 없으면 undefined */
export async function fetchTeam(kind: TeamKind | "quote-log"): Promise<unknown> {
  try {
    const res = await fetch(`/api/team?kind=${kind}`);
    if (!res.ok) return undefined;
    return ((await res.json()) as { data: unknown }).data;
  } catch {
    return undefined;
  }
}

export async function putTeam(kind: TeamKind, data: unknown): Promise<boolean> {
  try {
    const res = await fetch(`/api/team?kind=${kind}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    return res.ok;
  } catch {
    return false;
  }
}
