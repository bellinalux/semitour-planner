import { z } from "zod";
import { generateJson } from "./gemini";

export interface Place {
  /** 영문 도시 이름 (예: Pattaya) */
  city: string;
  /** 영문 국가 이름 (예: Thailand) */
  country: string;
  /** IATA 도시 코드 (예: BKK). 모르면 빈 문자열 */
  iata: string;
}

const placeSchema = z.object({
  city: z.string().describe("입력한 장소가 속한 도시(또는 대표 도시)의 영문 이름. 예: Pattaya, Paris, Osaka"),
  country: z.string().describe("그 도시가 속한 나라의 영문 이름. 예: Thailand, France, Japan"),
  iata: z
    .string()
    .describe(
      "그 장소에 가려면 이용하는 항공 노선의 IATA 도시 코드 3글자 대문자. 도시 코드가 있으면 도시 코드(서울 SEL, 파리 PAR, 도쿄 TYO, 오사카 OSA, 런던 LON, 방콕 BKK), 없으면 대표 공항 코드. 파타야처럼 공항이 없는 곳은 가장 가까운 관문 공항(방콕 BKK). 확실하지 않으면 빈 문자열",
    ),
});

const SYSTEM = `당신은 여행 지명 변환기입니다. 한국어 또는 영어로 된 장소 이름을 받아 영문 도시명, 영문 국가명, IATA 도시 코드를 JSON으로만 답합니다.
- 여러 도시가 쉼표로 적혀 있으면 첫 번째 도시를 기준으로 합니다.
- 출발지가 "인천"이면 서울(SEL)로 봅니다.
- 추측하지 말고, 확실하지 않은 IATA 코드는 빈 문자열로 둡니다.`;

const cache = new Map<string, Place>();

/** 이미 IATA 코드 형태(영문 3글자)면 그대로 쓴다 */
export function asIataCode(text: string): string | null {
  const t = text.trim();
  return /^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : null;
}

/** 장소 이름을 영문 도시/국가/IATA 코드로 바꾼다 (Gemini, 결과는 서버 메모리에 잠시 보관). */
export async function resolvePlace(text: string): Promise<Place> {
  const key = text.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const parsed = await generateJson({
    system: SYSTEM,
    user: `장소: ${text.trim()}`,
    schema: placeSchema,
    temperature: 0,
    timeoutMs: 30_000,
  });
  const iata = parsed.iata.trim().toUpperCase();
  const place: Place = {
    city: parsed.city.trim(),
    country: parsed.country.trim(),
    iata: /^[A-Z]{3}$/.test(iata) ? iata : "",
  };
  if (cache.size > 200) cache.clear();
  cache.set(key, place);
  return place;
}
