/**
 * 팀 공용 데이터(회사 기본값, 여행지별 원가 기억, 코스 조각 라이브러리)를 서버와 맞춘다.
 * 브라우저 저장(localStorage)을 그대로 쓰고, 서버를 쓸 수 있을 때만 서버와 주고받는다 — 서버가 없어도 지금처럼 동작한다.
 * 두 쪽이 다르면 더 최근에 저장한 값을 쓴다(원가 기억은 여행지별로 비교).
 */

export type TeamKind = "defaults" | "cost-memory" | "segments";

export const TEAM_KEYS: Record<TeamKind, string> = {
  defaults: "semitour-planner:defaults:v1",
  "cost-memory": "semitour-planner:cost-memory:v1",
  segments: "semitour-planner:segments:v1",
};
/** 지운 코스 조각 (id → 지운 시각) — 다른 사람 브라우저에서도 지워지게 */
export const SEGMENT_TOMB_KEY = "semitour-planner:segments:deleted:v1";
/** 서버에서 받은 코스 조각을 브라우저에 쓴 뒤 같은 탭의 화면을 다시 그리게 */
export const SEGMENTS_SYNC_EVENT = "semitour:segments-sync";

type Segmentish = { id: string; savedAt?: string };
type SegmentsTeam = { list: Segmentish[]; deleted: Record<string, string> };

/** 코스 조각: 같은 id는 더 최근 것, 지운 시각이 저장 시각보다 늦으면 뺀다 */
function mergeSegments(local: unknown, server: unknown): { merged: SegmentsTeam; pushBack: boolean } {
  const norm = (v: unknown): SegmentsTeam => {
    const o = isObj(v) ? v : {};
    return {
      list: Array.isArray(o.list) ? (o.list as unknown[]).filter((x): x is Segmentish => isObj(x) && typeof x.id === "string") : [],
      deleted: isObj(o.deleted) ? (Object.fromEntries(Object.entries(o.deleted).filter(([, at]) => typeof at === "string")) as Record<string, string>) : {},
    };
  };
  const l = norm(local);
  const s = norm(server);
  const deleted: Record<string, string> = { ...s.deleted };
  let pushBack = false;
  for (const [id, at] of Object.entries(l.deleted))
    if (!deleted[id] || at > deleted[id]) {
      deleted[id] = at;
      pushBack = true;
    }
  const byId = new Map(s.list.map((x) => [x.id, x]));
  for (const x of l.list) {
    const cur = byId.get(x.id);
    if (!cur || (x.savedAt ?? "") > (cur.savedAt ?? "")) {
      byId.set(x.id, x);
      pushBack = true;
    }
  }
  const list = [...byId.values()].filter((x) => !deleted[x.id] || deleted[x.id] < (x.savedAt ?? "")).sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
  return { merged: { list, deleted }, pushBack };
}

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
  if (kind === "segments") return mergeSegments(local, server);
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
  if (kind === "segments") {
    try {
      const list = JSON.parse(localStorage.getItem(TEAM_KEYS.segments) ?? "[]") as unknown;
      const deleted = JSON.parse(localStorage.getItem(SEGMENT_TOMB_KEY) ?? "{}") as unknown;
      return { list: Array.isArray(list) ? list : [], deleted: isObj(deleted) ? deleted : {} };
    } catch {
      return { list: [], deleted: {} };
    }
  }
  try {
    const raw = localStorage.getItem(TEAM_KEYS[kind]);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeTeamLocal(kind: TeamKind, value: unknown): void {
  if (kind === "segments") {
    try {
      const v = isObj(value) ? value : {};
      localStorage.setItem(TEAM_KEYS.segments, JSON.stringify(Array.isArray(v.list) ? v.list : []));
      localStorage.setItem(SEGMENT_TOMB_KEY, JSON.stringify(isObj(v.deleted) ? v.deleted : {}));
      window.dispatchEvent(new Event(SEGMENTS_SYNC_EVENT));
    } catch {
      // 무시
    }
    return;
  }
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
