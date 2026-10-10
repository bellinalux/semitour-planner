import { z } from "zod";

/**
 * 고객 만족도 — 귀국 뒤 고객에게 보내는 별점·후기 링크(/r/아이디). 상품·예약별로 모아 평균을 본다.
 * 링크 하나에 최대 100건, 1년 보관. 이름은 선택이고 연락처 같은 개인 정보는 받지 않는다.
 */

export const REVIEW_ID = /^[A-Za-z0-9_-]{16,40}$/;
export const MAX_REVIEWS = 100;

export const SCORE_KEYS = ["course", "guide", "meal", "hotel"] as const;
export const SCORE_LABELS: Record<(typeof SCORE_KEYS)[number], string> = { course: "일정·코스", guide: "가이드·기사", meal: "식사", hotel: "숙소" };

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  scores: z.object({ course: z.number().int().min(0).max(5), guide: z.number().int().min(0).max(5), meal: z.number().int().min(0).max(5), hotel: z.number().int().min(0).max(5) }).partial().default({}),
  comment: z.string().trim().max(500).default(""),
  name: z.string().trim().max(30).default(""),
});
export type ReviewInput = z.infer<typeof reviewSchema>;
export interface Review extends ReviewInput {
  at: string;
}

export const reviewLinkSchema = z.object({
  title: z.string().trim().min(1).max(120),
  planName: z.string().trim().max(120).default(""),
  company: z.string().trim().max(80).default(""),
});
export type ReviewLink = z.infer<typeof reviewLinkSchema> & { createdAt: string };

export interface ReviewSummary {
  id: string;
  title: string;
  planName: string;
  count: number;
  /** 평균 별점 (없으면 null) */
  average: number | null;
  scores: Partial<Record<(typeof SCORE_KEYS)[number], number>>;
  comments: { at: string; rating: number; comment: string; name: string }[];
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

export function summarizeReviews(id: string, link: ReviewLink, reviews: Review[]): ReviewSummary {
  const scores: ReviewSummary["scores"] = {};
  for (const k of SCORE_KEYS) {
    const v = avg(reviews.map((r) => r.scores?.[k] ?? 0).filter((x) => x > 0));
    if (v !== null) scores[k] = v;
  }
  return {
    id,
    title: link.title,
    planName: link.planName,
    count: reviews.length,
    average: avg(reviews.map((r) => r.rating)),
    scores,
    comments: reviews
      .filter((r) => r.comment)
      .slice(-5)
      .reverse()
      .map((r) => ({ at: r.at, rating: r.rating, comment: r.comment, name: r.name })),
  };
}

/** 예약 메모에 남긴 후기 링크에서 아이디 */
export function reviewIdsIn(text: string): string[] {
  return [...text.matchAll(/\/r\/([A-Za-z0-9_-]{16,40})/g)].map((m) => m[1]);
}
