import { MAX_REVIEWS, REVIEW_ID, summarizeReviews, type Review, type ReviewLink, type ReviewSummary } from "@/lib/reviews";
import { getKv } from "./planStore";
import { newShareId } from "./shareStore";

/** 고객 만족도 링크 저장 — KV(PLANS)의 review: 키, 1년 */
const TTL = 60 * 60 * 24 * 365;
const keyOf = (id: string) => `review:${id}`;

interface Stored {
  link: ReviewLink;
  reviews: Review[];
}

async function read(id: string): Promise<Stored | null> {
  if (!REVIEW_ID.test(id)) return null;
  const store = await getKv();
  if (!store) return null;
  const raw = await store.kv.get(keyOf(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Stored;
  } catch {
    return null;
  }
}

async function write(id: string, data: Stored): Promise<boolean> {
  const store = await getKv();
  if (!store) return false;
  await store.kv.put(keyOf(id), JSON.stringify(data), { expirationTtl: TTL });
  return true;
}

export async function createReviewLink(link: Omit<ReviewLink, "createdAt">): Promise<string | null> {
  const id = newShareId();
  return (await write(id, { link: { ...link, createdAt: new Date().toISOString() }, reviews: [] })) ? id : null;
}

export async function reviewLinkInfo(id: string): Promise<ReviewLink | null> {
  return (await read(id))?.link ?? null;
}

/** 후기 한 건 더하기. 링크가 없거나 가득 차면 false */
export async function addReview(id: string, review: Review): Promise<"ok" | "missing" | "full"> {
  const cur = await read(id);
  if (!cur) return "missing";
  if (cur.reviews.length >= MAX_REVIEWS) return "full";
  await write(id, { ...cur, reviews: [...cur.reviews, review] });
  return "ok";
}

export async function reviewSummaries(ids: string[]): Promise<ReviewSummary[]> {
  const out: ReviewSummary[] = [];
  for (const id of ids.slice(0, 100)) {
    const cur = await read(id);
    if (cur) out.push(summarizeReviews(id, cur.link, cur.reviews));
  }
  return out;
}
