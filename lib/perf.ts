/**
 * 속도 기록 — 실제로 직원이 쓸 때 코스 생성·자동 견적이 얼마나 걸렸는지 모아, 관리자가 실서버 속도를 본다.
 * 서버 저장을 못 쓰는 환경(로컬)에서는 보내지 않는다(조용히 실패).
 */
export type PerfKind = "generate" | "auto-quote";

export interface PerfEntry {
  at: string;
  kind: PerfKind;
  /** 전체 걸린 시간(ms) */
  totalMs: number;
  /** 단계별 걸린 시간(ms) — 자동 견적의 차량·가이드, 숙박·항공 등 */
  steps: Record<string, number>;
  destination: string;
  by?: string;
}

export const PERF_KINDS: PerfKind[] = ["generate", "auto-quote"];
export const MAX_PERF = 200;

export function isPerfEntry(v: unknown): v is PerfEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    PERF_KINDS.includes(o.kind as PerfKind) &&
    typeof o.totalMs === "number" &&
    o.totalMs >= 0 &&
    o.totalMs < 3_600_000 &&
    typeof o.steps === "object" &&
    o.steps !== null &&
    Object.values(o.steps).every((ms) => typeof ms === "number" && ms >= 0 && ms < 3_600_000) &&
    typeof o.destination === "string" &&
    o.destination.length <= 100
  );
}

/** 화면에서 한 번 쟀을 때 서버로 보낸다 (응답은 기다리지 않는다) */
export function reportPerf(kind: PerfKind, totalMs: number, steps: Record<string, number>, destination: string): void {
  if (typeof window === "undefined") return;
  const entry: Omit<PerfEntry, "at" | "by"> = { kind, totalMs, steps, destination: destination.slice(0, 100) };
  void fetch("/api/perf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }).catch(() => undefined);
}

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);

export interface PerfRow {
  label: string;
  count: number;
  medianMs: number;
  p90Ms: number;
}

/** 종류·단계별 가운데값과 느린 쪽(상위 10%) — 최근 기록 기준 */
export function summarizePerf(list: PerfEntry[], stepLabels: Record<string, string> = {}): PerfRow[] {
  const rows: PerfRow[] = [];
  const add = (label: string, values: number[]) => {
    if (values.length === 0) return;
    const sorted = [...values].sort((a, b) => a - b);
    rows.push({ label, count: values.length, medianMs: percentile(sorted, 0.5), p90Ms: percentile(sorted, 0.9) });
  };
  add("코스 만들기", list.filter((e) => e.kind === "generate").map((e) => e.totalMs));
  const quotes = list.filter((e) => e.kind === "auto-quote");
  add("자동 견적 전체", quotes.map((e) => e.totalMs));
  const keys = [...new Set(quotes.flatMap((e) => Object.keys(e.steps)))];
  for (const key of keys) add(`· ${stepLabels[key] ?? key}`, quotes.map((e) => e.steps[key]).filter((v): v is number => typeof v === "number" && v >= 1000));
  return rows;
}

/** 작업 하나의 걸린 시간을 재서 기록한다 (결과가 없으면 = 실패·취소면 기록하지 않는다) */
export async function timed<T>(kind: PerfKind, destination: string, task: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await task();
  if (result) reportPerf(kind, Math.round(performance.now() - started), {}, destination);
  return result;
}
