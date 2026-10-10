/**
 * 지식 창고 발전 지표 — 달마다: 웹 조사·저장 지식 재사용(조사 절약)·우리 자료로 배운 횟수·
 * AI가 넣은 장소 중 직원이 뺀 비율·코스 점검 평균 점수. 쓸수록 재사용이 늘고, 뺀 비율이 줄고, 점수가 오르면 발전하는 것.
 */

export interface MonthMetrics {
  research: number;
  reuse: number;
  learned: number;
  byKind: Record<string, number>;
  /** AI가 만든 일정에 넣은 장소 수 */
  aiPlaces: number;
  /** 그중 직원이 지운 수 / 직접 넣은 수 */
  removed: number;
  added: number;
  scoreSum: number;
  scoreN: number;
}

export type MetricsRecord = Record<string, MonthMetrics>;

export const monthOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function emptyMonth(): MonthMetrics {
  return { research: 0, reuse: 0, learned: 0, byKind: {}, aiPlaces: 0, removed: 0, added: 0, scoreSum: 0, scoreN: 0 };
}

export interface MetricsPatch {
  research?: number;
  reuse?: number;
  learned?: number;
  kind?: string;
  aiPlaces?: number;
  removed?: number;
  added?: number;
  score?: number;
}

/** 이번 달 값을 더한다 (최근 24개월만 남긴다) */
export function bumpMetrics(rec: MetricsRecord, patch: MetricsPatch, now = new Date()): MetricsRecord {
  const m = monthOf(now);
  const cur = { ...emptyMonth(), ...rec[m], byKind: { ...(rec[m]?.byKind ?? {}) } };
  cur.research += patch.research ?? 0;
  cur.reuse += patch.reuse ?? 0;
  cur.learned += patch.learned ?? 0;
  if (patch.kind) cur.byKind[patch.kind] = (cur.byKind[patch.kind] ?? 0) + 1;
  cur.aiPlaces += patch.aiPlaces ?? 0;
  cur.removed += patch.removed ?? 0;
  cur.added += patch.added ?? 0;
  if (typeof patch.score === "number" && patch.score >= 0 && patch.score <= 100) {
    cur.scoreSum += patch.score;
    cur.scoreN += 1;
  }
  const next = { ...rec, [m]: cur };
  return Object.fromEntries(
    Object.entries(next)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 24),
  );
}

export interface MetricsRow {
  month: string;
  research: number;
  reuse: number;
  learned: number;
  /** 직원이 뺀 비율 (%) — AI 장소가 없으면 null */
  removedRate: number | null;
  /** 코스 점검 평균 — 없으면 null */
  score: number | null;
}

/** 최근 n개월 (오래된 달부터, 빈 달은 0) */
export function metricsRows(rec: MetricsRecord, months = 6, now = new Date()): MetricsRow[] {
  const out: MetricsRow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = monthOf(new Date(now.getFullYear(), now.getMonth() - i, 1));
    const r = rec[m] ?? emptyMonth();
    out.push({
      month: m,
      research: r.research,
      reuse: r.reuse,
      learned: r.learned,
      removedRate: r.aiPlaces > 0 ? Math.round((r.removed / r.aiPlaces) * 1000) / 10 : null,
      score: r.scoreN > 0 ? Math.round(r.scoreSum / r.scoreN) : null,
    });
  }
  return out;
}
