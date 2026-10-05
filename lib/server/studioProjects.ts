/**
 * 팀 보관함 — 상세페이지 스튜디오 프로젝트를 같은 접근 코드를 쓰는 사람끼리 함께 쓴다(PLANS KV, 접두어 tdp:/tdpv:).
 *  - 최신본: tdp:{작업공간}:{id}  (목록용 정보는 KV metadata에)
 *  - 버전:   tdpv:{작업공간}:{id}:{버전 번호 6자리}  — 저장할 때마다 하나씩, 최근 MAX_VERSIONS개만 남긴다
 *  - 검수 흐름: draft(작성 중) → review(검수 요청) → changes(수정 요청) / approved(승인), 상태를 바꿀 때 메모를 history에 쌓는다
 */
import { z } from "zod";
import { getKv } from "./planStore";

export const MAX_PROJECT_BYTES = 10 * 1024 * 1024;
export const MAX_VERSIONS = 20;
export const PROJECT_ID = /^tdp-[a-z0-9-]{4,40}$/;
export const STATUSES = ["draft", "review", "changes", "approved"] as const;
export type ProjectStatus = (typeof STATUSES)[number];

export const saveSchema = z.object({
  id: z.string().regex(PROJECT_ID).optional(),
  title: z.string().max(200),
  country: z.string().max(60).default(""),
  region: z.string().max(60).default(""),
  status: z.enum(STATUSES).default("draft"),
  note: z.string().max(1000).default(""),
  by: z.string().max(40).default(""),
  baseVersion: z.number().int().nonnegative().optional(),
  force: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()),
  /** 세 스튜디오 공통 상품 데이터(studio-product) — 승인되면 회사 코스 템플릿으로 세미투어에서도 쓴다 */
  product: z.record(z.string(), z.unknown()).optional(),
});
export type SaveRequest = z.infer<typeof saveSchema>;

export interface HistoryItem { at: string; by: string; status: ProjectStatus; note: string; version: number }
export interface ProjectEntry { id: string; title: string; country: string; region: string; status: ProjectStatus; savedAt: string; savedBy: string; version: number; lastNote: string; summary?: string; hasProduct?: boolean }
interface StoredProject extends ProjectEntry { history: HistoryItem[]; data: Record<string, unknown>; product?: Record<string, unknown> }
export interface VersionEntry { version: number; savedAt: string; savedBy: string; status: ProjectStatus; note: string }

type Kv = NonNullable<Awaited<ReturnType<typeof getKv>>>["kv"];
const latestKey = (ws: string, id: string) => `tdp:${ws}:${id}`;
const versionPrefix = (ws: string, id: string) => `tdpv:${ws}:${id}:`;
const versionKey = (ws: string, id: string, v: number) => versionPrefix(ws, id) + String(v).padStart(6, "0");
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** 목록에 보일 코스 요약 ("로마 · 4곳: 바티칸 → 콜로세움 → …") */
function summaryOf(product?: Record<string, unknown>): string {
  const days = (product?.days as { courses?: { name?: string }[] }[] | undefined) ?? [];
  const names = days.flatMap(d => (d.courses ?? []).map(c => String(c.name ?? ""))).filter(Boolean);
  if (!names.length) return "";
  const head = [product?.region, product?.duration].filter(Boolean).join(" · ");
  return short(`${head ? head + " · " : ""}${names.length}곳: ${names.slice(0, 4).join(" → ")}${names.length > 4 ? " …" : ""}`, 140);
}
function entryOf(p: StoredProject): ProjectEntry {
  return { id: p.id, title: short(p.title, 80), country: p.country, region: p.region, status: p.status, savedAt: p.savedAt, savedBy: p.savedBy, version: p.version, lastNote: short(p.lastNote, 120), summary: summaryOf(p.product), hasProduct: !!p.product };
}

export async function listProjects(kv: Kv, ws: string): Promise<ProjectEntry[]> {
  const out: ProjectEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: `tdp:${ws}:`, cursor, limit: 1000 });
    for (const k of page.keys) if (k.metadata && typeof k.metadata === "object") out.push(k.metadata as ProjectEntry);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function getProject(kv: Kv, ws: string, id: string): Promise<StoredProject | null> {
  const raw = await kv.get(latestKey(ws, id));
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredProject; } catch { return null; }
}

export async function listVersions(kv: Kv, ws: string, id: string): Promise<VersionEntry[]> {
  const page = await kv.list({ prefix: versionPrefix(ws, id), limit: 1000 });
  return page.keys.map((k) => k.metadata as VersionEntry).filter(Boolean).sort((a, b) => b.version - a.version);
}

export async function getVersion(kv: Kv, ws: string, id: string, v: number): Promise<{ meta: VersionEntry; data: Record<string, unknown> } | null> {
  const raw = await kv.get(versionKey(ws, id, v));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** 저장 — 다른 사람이 그 사이에 저장했으면(baseVersion이 최신이 아니면) conflict로 알려 준다(force면 그대로 덮어씀) */
export async function saveProject(kv: Kv, ws: string, req: SaveRequest): Promise<{ ok: true; entry: ProjectEntry } | { ok: false; conflict: ProjectEntry }> {
  const id = req.id ?? `tdp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const prev = req.id ? await getProject(kv, ws, id) : null;
  if (prev && req.baseVersion !== undefined && req.baseVersion !== prev.version && !req.force) return { ok: false, conflict: entryOf(prev) };
  const version = (prev?.version ?? 0) + 1;
  const savedAt = new Date().toISOString();
  const statusChanged = !prev || prev.status !== req.status;
  const history = [...(prev?.history ?? [])];
  if (statusChanged || req.note) history.push({ at: savedAt, by: req.by, status: req.status, note: req.note, version });
  const stored: StoredProject = {
    id, title: req.title, country: req.country, region: req.region, status: req.status, savedAt, savedBy: req.by, version,
    lastNote: req.note || prev?.lastNote || "", history: history.slice(-100), data: req.data,
    product: req.product ?? prev?.product,
  };
  const entry = entryOf(stored);
  await kv.put(latestKey(ws, id), JSON.stringify(stored), { metadata: entry });
  const vmeta: VersionEntry = { version, savedAt, savedBy: req.by, status: req.status, note: short(req.note, 100) };
  await kv.put(versionKey(ws, id, version), JSON.stringify({ meta: vmeta, data: req.data }), { metadata: vmeta });
  // 오래된 버전 정리
  const versions = await listVersions(kv, ws, id);
  for (const v of versions.slice(MAX_VERSIONS)) await kv.delete(versionKey(ws, id, v.version));
  return { ok: true, entry };
}

export async function deleteProject(kv: Kv, ws: string, id: string): Promise<void> {
  for (const v of await listVersions(kv, ws, id)) await kv.delete(versionKey(ws, id, v.version));
  await kv.delete(latestKey(ws, id));
}
