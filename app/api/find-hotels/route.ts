import { citiesOf } from "@/lib/knowledge";
import { addHotel, gradeMatches, hotelScore, pickRate, type HotelRateCard, type PickedRate } from "@/lib/rateBook";
import { hotelRequestSchema, hotelResponseSchema, mapSearchUrl, toHotelCandidates } from "@/lib/schemas/hotels";
import { getRates, updateRates } from "@/lib/server/rateStore";
import { GeminiError, generateGroundedText, generateJson } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { cached, DAY } from "@/lib/server/aiCache";
import {
  buildHotelResearchPrompt,
  buildHotelStructurePrompt,
  HOTEL_STRUCTURE_SYSTEM_PROMPT,
} from "@/lib/server/hotelPrompt";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = hotelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  const city = citiesOf(parsed.data.destination)[0] ?? parsed.data.destination;
  // 회사 요금표에 조건에 맞는(등급·예산) 요금이 살아 있는 호텔이 4곳 이상이면 검색 없이 쓴다
  if (parsed.data.lodgingType !== "bnb") {
    const book = await getRates(city).catch(() => null);
    const fromBook = (book?.hotels ?? [])
      .filter((h) => gradeMatches(h.grade, parsed.data.lodgingType === "resort" ? "resort" : parsed.data.grade))
      .map((h) => ({ h, pick: pickRate(h.rates, parsed.data.currency, 0) }))
      .filter((x): x is { h: HotelRateCard; pick: PickedRate } => x.pick !== null && (!parsed.data.maxNightly || x.pick.mid <= parsed.data.maxNightly * 1.15))
      .sort((a, b) => hotelScore(b.h) - hotelScore(a.h))
      .slice(0, 6);
    if (fromBook.length >= 4)
      return Response.json({
        hotels: fromBook.map(({ h, pick }) => ({
          name: h.name,
          grade: h.grade,
          area: h.area,
          nearestStation: "",
          walkMinutes: 0,
          nightlyLow: pick.low,
          nightlyHigh: pick.high,
          priceBasis: "searched",
          koreanFriendly: h.korean,
          koreanNote: h.koreanNote,
          highlights: h.agencies.length ? `${h.agencies.join("·")} 패키지 사용` : "",
          mapUrl: mapSearchUrl(h.name, parsed.data.destination),
          agencies: h.agencies,
          rateBasis: `회사 요금표 — ${pick.basis}`,
        })),
        sources: [],
        searched: true,
        searchedAt: new Date().toISOString(),
        fromBook: true,
      });
  }

  try {
    // 같은 조건의 숙소 검색은 하루 동안 다시 쓴다 (검색 근거가 있고 숙소를 찾은 결과만)
    const result = await cached(
      "hotels",
      parsed.data,
      DAY,
      async () => {
        // 1단계: Google 검색으로 조사 (출처 수집)
        const research = await generateGroundedText({ user: buildHotelResearchPrompt(parsed.data), fast: true });

        // 2단계: 조사 메모를 JSON으로 정리 (메모에 없는 내용은 만들지 않는다)
        const structured = await generateJson({
          fast: true,
          system: HOTEL_STRUCTURE_SYSTEM_PROMPT,
          user: buildHotelStructurePrompt(parsed.data, research.text),
          schema: hotelResponseSchema,
          temperature: 0.1,
        });

        const hotels = toHotelCandidates(structured, parsed.data.destination).map((h) =>
          // 검색 근거가 없으면 "검색 확인", "한국인 이용 확인", 역·도보 정보를 믿을 수 없으므로 지운다
          research.searched
            ? h
            : { ...h, priceBasis: "estimated" as const, koreanFriendly: false, koreanNote: "", nearestStation: "", walkMinutes: 0 },
        );
        return { hotels, sources: research.sources, searched: research.searched, searchedAt: new Date().toISOString() };
      },
      (r) => r.searched && r.hotels.length > 0,
    );
    if (result.hotels.length === 0) {
      return errorResponse("BAD_OUTPUT", "조건에 맞는 숙소를 찾지 못했습니다. 조건을 줄여서 다시 시도해 주세요.", 422);
    }
    // 찾은 호텔은 회사 요금표에 쌓는다 (요금을 확인한 것만 시세로)
    if (result.searched && parsed.data.lodgingType !== "bnb")
      await updateRates(city, (d) =>
        result.hotels.reduce(
          (doc, h) =>
            addHotel(
              doc,
              { name: h.name, grade: h.grade, area: h.area, korean: h.koreanFriendly, koreanNote: h.koreanNote, agencies: h.agencies ?? [] },
              h.priceBasis === "searched" && h.nightlyHigh > 0 ? { at: new Date().toISOString(), month: 0, low: h.nightlyLow, high: h.nightlyHigh, currency: parsed.data.currency, source: "web", by: "웹 시세" } : null,
            ),
          d,
        ),
      );
    return Response.json(result);
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[find-hotels]", err);
    return errorResponse("INTERNAL", "숙소 검색 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
