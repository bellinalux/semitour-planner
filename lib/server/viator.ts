import {
  findDestination,
  parseDestinations,
  parseProducts,
  parseTags,
  pickTopProducts,
  productToTour,
  tagIdsFor,
  type ViatorDestination,
  type ViatorTag,
} from "@/lib/marketData";
import type { ViatorRequest } from "@/lib/schemas/market";
import type { TourCategory, ViatorSearchResult } from "@/types";
import { ExternalError, fetchJson, isRecord, readSecret } from "./external";
import { resolvePlace } from "./places";

const DEFAULT_BASE_URL = "https://api.viator.com/partner";
/** 목적지·태그 목록은 자주 바뀌지 않아 서버 메모리에 하루 동안 보관한다 (Viator 권장: 캐시) */
const LIST_TTL_MS = 24 * 60 * 60 * 1000;
const PER_CATEGORY = 5;
const FETCH_COUNT = 30;

function baseUrl(): string {
  return (process.env.VIATOR_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function headers(key: string): HeadersInit {
  return {
    "exp-api-key": key,
    Accept: "application/json;version=2.0",
    "Accept-Language": "en-US",
    "Content-Type": "application/json",
  };
}

async function viatorFetch(key: string, path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<unknown> {
  const res = await fetchJson(
    `${baseUrl()}${path}`,
    { method: init.method, headers: headers(key), body: init.body === undefined ? undefined : JSON.stringify(init.body) },
    25_000,
    "투어 시세(Viator)",
  );
  if (res.status === 401 || res.status === 403) {
    throw new ExternalError(
      "UPSTREAM",
      "Viator API 키가 올바르지 않거나 이 기능을 쓸 권한이 없습니다. 서버에 등록한 VIATOR_API_KEY 값(제휴 API 키)을 확인해 주세요.",
      502,
    );
  }
  if (res.status === 429) {
    throw new ExternalError("UPSTREAM", "Viator 조회 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.", 429);
  }
  if (!res.ok) {
    const detail = isRecord(res.body) && typeof res.body.message === "string" ? `: ${res.body.message.slice(0, 100)}` : "";
    throw new ExternalError("UPSTREAM", `Viator 서버 오류 (${res.status})${detail}`, 502);
  }
  return res.body;
}

let destinationCache: { at: number; list: ViatorDestination[] } | null = null;
let tagCache: { at: number; list: ViatorTag[] } | null = null;

async function getDestinations(key: string): Promise<ViatorDestination[]> {
  if (destinationCache && Date.now() - destinationCache.at < LIST_TTL_MS) return destinationCache.list;
  const list = parseDestinations(await viatorFetch(key, "/destinations", { method: "GET" }));
  if (list.length === 0) throw new ExternalError("BAD_OUTPUT", "Viator 목적지 목록을 읽지 못했습니다.", 502);
  destinationCache = { at: Date.now(), list };
  return list;
}

async function getTags(key: string): Promise<ViatorTag[]> {
  if (tagCache && Date.now() - tagCache.at < LIST_TTL_MS) return tagCache.list;
  const list = parseTags(await viatorFetch(key, "/products/tags", { method: "GET" }));
  tagCache = { at: Date.now(), list };
  return list;
}

/** 여행지의 Viator 판매 상품(요금·평점·후기)을 투어 종류별로 가져온다. */
export async function searchViator(req: ViatorRequest): Promise<ViatorSearchResult> {
  const key = readSecret("VIATOR_API_KEY");
  if (!key) {
    throw new ExternalError(
      "NO_KEY",
      "Viator 조회용 키(VIATOR_API_KEY)가 등록되지 않았습니다. 키를 등록하기 전에는 \"투어 검색\"(웹 검색)을 사용하세요.",
      503,
    );
  }

  const place = await resolvePlace(req.destination);
  const [destinations, tags] = await Promise.all([getDestinations(key), getTags(key)]);
  const destination = findDestination(destinations, place.city, place.country);
  if (!destination) {
    throw new ExternalError("NOT_FOUND", `Viator에서 "${place.city}" 지역을 찾지 못했습니다. 근처 큰 도시 이름으로 다시 검색해 보세요.`, 404);
  }

  const skipped: TourCategory[] = [];
  const perCategory = await Promise.all(
    req.categories.map(async (category) => {
      const tagIds = tagIdsFor(category, tags);
      if (tagIds.length === 0) {
        skipped.push(category);
        return [];
      }
      const body = await viatorFetch(key, "/products/search", {
        method: "POST",
        body: {
          filtering: { destination: String(destination.id), tags: tagIds },
          sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
          pagination: { start: 1, count: FETCH_COUNT },
          currency: req.currency,
        },
      });
      return pickTopProducts(parseProducts(body), PER_CATEGORY).map((p) => productToTour(p, category));
    }),
  );

  // 같은 상품이 여러 종류에 걸려 나오면 먼저 나온 종류에 한 번만 둔다
  const seen = new Set<string>();
  const tours = perCategory.flat().filter((t) => {
    const code = t.market?.productCode ?? t.name;
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  });
  return { tours, skipped, destinationName: destination.name };
}
