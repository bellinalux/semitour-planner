import { citiesOf } from "@/lib/knowledge";
import { lodgingWebSearchUrl } from "@/lib/schemas/lodgingSearch";
import { addHotel, findHotel, pickRate } from "@/lib/rateBook";
import { getRates, updateRates } from "@/lib/server/rateStore";
import { lodgingWebRequestSchema, lodgingWebResponseSchema, toLodgingWebEstimate } from "@/lib/schemas/lodgingSearch";
import {
  buildLodgingResearchPrompt,
  buildLodgingStructurePrompt,
  LODGING_STRUCTURE_SYSTEM_PROMPT,
} from "@/lib/server/lodgingSearchPrompt";
import { GeminiError, generateGroundedText, generateJson } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { cached, DAY } from "@/lib/server/aiCache";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * API가 아니라 AI 웹 검색(Booking.com, Agoda, 네이버 호텔 등)으로 숙박 요금을 확인한다.
 * 키·가입이 필요 없다. 항공 요금 확인과 별도로, 숙박만 따로 조회한다.
 */
export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = lodgingWebRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  const req = parsed.data;
  const city = citiesOf(req.destination)[0] ?? req.destination;
  const month = req.checkIn && /^\d{4}-\d{2}/.test(req.checkIn) ? Number(req.checkIn.slice(5, 7)) : 0;
  const names = req.hotelNames ?? [];
  // 견적서 호텔이 모두 회사 요금표에 살아 있는 요금(업체 견적가 6개월·시즌 / 웹 시세 30일)이 있으면 검색하지 않는다
  if (names.length > 0) {
    const book = await getRates(city).catch(() => null);
    const picks = names.map((name) => {
      const card = book ? findHotel(book, name) : undefined;
      return { name, pick: card ? pickRate(card.rates, req.currency, month) : null };
    });
    if (picks.every((p) => p.pick)) {
      const hotels = picks.map((p) => ({ name: p.name, rateLow: p.pick!.low, rateHigh: p.pick!.high, found: true, sourceName: `요금표 · ${p.pick!.basis}` }));
      return Response.json({
        estimate: {
          hotels,
          rateLow: Math.min(...hotels.map((h) => h.rateLow)),
          rateHigh: Math.max(...hotels.map((h) => h.rateHigh)),
          basis: "searched",
          cityTaxPerPersonPerNight: 0,
          areaNote: "",
          sourceName: "회사 요금표",
          priceNote: "저장된 요금표에서 가져왔습니다 (다시 검색하지 않음)",
          searchUrl: lodgingWebSearchUrl(req.destination, req.lodgingType),
          checkedAt: new Date().toISOString(),
        },
        sources: [],
        searched: true,
        fromBook: true,
      });
    }
  }

  try {
    // 같은 조건(호텔 이름·날짜 포함)은 하루 동안 다시 쓴다 (검색 근거가 있는 결과만)
    const result = await cached(
      "lodging-web",
      parsed.data,
      DAY,
      async () => {
        // 1단계: Google 검색으로 조사 (출처 수집)
        const research = await generateGroundedText({ user: buildLodgingResearchPrompt(parsed.data), fast: true });

        // 2단계: 조사 메모를 JSON으로 정리 (메모에 없는 내용은 만들지 않는다)
        const structured = await generateJson({
          fast: true,
          system: LODGING_STRUCTURE_SYSTEM_PROMPT,
          user: buildLodgingStructurePrompt(parsed.data, research.text),
          schema: lodgingWebResponseSchema,
          temperature: 0.1,
        });

        const estimate = toLodgingWebEstimate(structured, parsed.data);
        // 검색 근거가 없으면 "검색 확인" 표시를 믿을 수 없으므로 낮춘다
        const final = research.searched
          ? estimate
          : { ...estimate, basis: "estimated" as const, sourceName: "", hotels: estimate.hotels?.map((h) => ({ ...h, found: false })) };
        return { estimate: final, sources: research.sources, searched: research.searched };
      },
      // 호텔 이름으로 찾았는데 한 곳도 못 찾았으면 저장하지 않는다 (다음에 다시 찾는다)
      (r) => r.searched && (!(parsed.data.hotelNames ?? []).length || (r.estimate.hotels ?? []).some((h) => h.found)),
    );

    // 찾은 호텔 요금은 회사 요금표에 쌓는다
    const found = (result.estimate.hotels ?? []).filter((h) => h.found);
    if (result.searched && found.length > 0)
      await updateRates(city, (d) =>
        found.reduce((doc, h) => addHotel(doc, { name: h.name }, { at: new Date().toISOString(), month, low: h.rateLow, high: h.rateHigh, currency: req.currency, source: "web", by: h.sourceName || "웹 시세" }), d),
      );
    return Response.json(result);
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[search-lodging-price]", err);
    return errorResponse("INTERNAL", "숙박 요금 검색 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
