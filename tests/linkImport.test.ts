import { afterEach, describe, expect, it, vi } from "vitest";
import { finishCourse } from "@/lib/courseFinish";
import { calcDayGap } from "@/lib/dayLoad";
import { flightDayGaps, flightTimesFor, withFlightDays } from "@/lib/flightPlan";
import { flightFromImport, importPatch, reverseBudget } from "@/lib/productImport";
import { itineraryResponseSchema, toDayPlans } from "@/lib/schemas/itinerary";
import type { ProductImportResponse } from "@/lib/schemas/productImport";
import { pageText, safeUrl } from "@/lib/server/productImport";
import { input } from "./fixtures";

const acc = { level: "unknown", wheelchairAccessible: false, accessibleRestroom: false, elevator: false, ramp: false, note: "", mustSeeButHard: false };
const place = (name: string) => ({ type: "sightseeing", mealSlot: "none", name, description: "", stayMinutes: 120, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, caution: "", cuisine: "", accessibility: acc });
const day = (n: number, extra: object) => ({ day: n, theme: "", overnightCity: "오사카", amGuided: [], pmFreeOptions: [], fullDay: [], freeNote: "", style: "full", ...extra });
const osaka = input({ destination: "오사카, 일본", originCity: "인천", includesFlights: true, tripScope: "overseas", days: 3, nights: 2, mode: "ai" });

describe("도착일을 AI가 비워 보낼 때", () => {
  it("'전일 자유일정'으로 바꾸지 않고 빈 시간으로 감지해 채울 수 있게 한다", () => {
    for (const d1 of [day(1, {}), day(1, { style: "free" })]) {
      const raw = itineraryResponseSchema.parse({ days: [d1, day(2, { fullDay: [place("교토")] }), day(3, { fullDay: [place("시장")] })] });
      const out = finishCourse(withFlightDays(toDayPlans(raw, 3), osaka, flightTimesFor(osaka)!), osaka).days;
      expect(out[0].items.map((i) => i.name)).not.toContain("전일 자유일정");
      const gaps = flightDayGaps(out, (d) => calcDayGap(d, {}, false));
      expect(gaps.find((g) => g.kind === "arrival")?.freeMinutes).toBeGreaterThanOrEqual(150);
    }
  });
});

const imported: ProductImportResponse = {
  found: true, productName: "오사카 교토 3일 #노쇼핑", agency: "노랑풍선", destination: "오사카, 교토", departureDate: "2027-01-04", nights: 2, days: 3,
  pricePerPerson: 899000, priceNote: "유류할증료 포함", hotel: "호텔 A 4성",
  outbound: { airline: "대한항공", flightNumber: "KE723", date: "2027-01-04", departAirport: "인천(ICN)", departTime: "09:50", arriveAirport: "간사이(KIX)", arriveTime: "11:45" },
  inbound: { airline: "대한항공", flightNumber: "KE724", date: "2027-01-06", departAirport: "간사이(KIX)", departTime: "20:30", arriveAirport: "인천(ICN)", arriveTime: "22:25" },
  mustSee: ["오사카성", "도톤보리", "기요미즈데라"], included: [], excluded: [], shopping: 0, optionTours: [], guideFee: "", cancelPolicy: "", courseDetail: true,
  courseText: "제1일 인천 출발 KE723 09:50 → 간사이 11:45 / 오사카성 / 석식 / 호텔 A\n제2일 교토 기요미즈데라 ...\n제3일 KE724 20:30",
  url: "https://pkgtour.naver.com/products/ybtour/X", readDirect: false, sources: [],
};

describe("상품 링크 → 우리 입력값", () => {
  it("항공편·기간·판매가(역계산)·경쟁 상품, 우리 코스는 주요 방문지를 꼭 넣을 것으로", () => {
    const f = flightFromImport(imported)!;
    expect(f).toMatchObject({ departTime: "09:50", arriveTime: "11:45", returnDepartTime: "20:30", returnDepartDate: "2027-01-06" });
    const ours = importPatch(imported, osaka, "ours");
    expect(ours).toMatchObject({ mode: "ai", days: 3, nights: 2, departureDate: "2027-01-04", includesFlights: true, packageType: "full", pricingMode: "fixed_price", fixedPricePerPerson: 899000, mustHave: "오사카성, 도톤보리, 기요미즈데라" });
    expect(ours.competitors?.[0]).toMatchObject({ price: 899000, places: ["오사카성", "도톤보리", "기요미즈데라"], shopping: "none" });
    const copy = importPatch(imported, osaka, "copy");
    expect(copy).toMatchObject({ mode: "paste" });
    expect(copy.courseText).toContain("제1일");
    expect(reverseBudget(899000, { targetMarginRate: 15, cardFeeRate: 3 })).toBe(737180);
  });
});

describe("페이지 읽기", () => {
  afterEach(() => vi.restoreAllMocks());

  it("내부망·IP 링크는 읽지 않는다", () => {
    expect(safeUrl("https://pkgtour.naver.com/products/a")).not.toBeNull();
    expect(safeUrl("http://localhost:3000")).toBeNull();
    expect(safeUrl("http://169.254.169.254/latest")).toBeNull();
    expect(safeUrl("file:///etc/passwd")).toBeNull();
  });

  it("HTML에서 글·메타·상품 데이터(JSON)를 뽑고 스크립트는 뺀다", () => {
    const html = `<html><head><meta property="og:title" content="오사카 3일"><script>alert(1)</script>
      <script id="__NEXT_DATA__" type="application/json">{"price":899000,"name":"\\uc624\\uc0ac\\uce74"}</script></head>
      <body><div>제1일</div><p>오사카성&nbsp;관광</p></body></html>`;
    const t = pageText(html);
    expect(t).toContain("og:title: 오사카 3일");
    expect(t).toContain('"price":899000');
    expect(t).toContain("오사카");
    expect(t).toContain("오사카성 관광");
    expect(t).not.toContain("alert(1)");
  });

  it("서버: 페이지 + AI(링크 읽기)로 정리", async () => {
    process.env.GEMINI_API_KEY = "k";
    const bodies: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("pkgtour")) return new Response("<html><body>" + "오사카 일정 ".repeat(200) + "</body></html>", { status: 200 });
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return body.tools
        ? Response.json({ candidates: [{ content: { parts: [{ text: "메모" }] }, urlContextMetadata: { urlMetadata: [{ retrievedUrl: "x", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" }] } }] })
        : Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...imported, url: undefined, readDirect: undefined, sources: undefined }) }] } }] });
    });
    const { importProduct } = await import("@/lib/server/productImport");
    const r = await importProduct({ url: "https://pkgtour.naver.com/products/ybtour/JKP14657C00-20270104", currency: "KRW" });
    expect(r).toMatchObject({ found: true, pricePerPerson: 899000, readDirect: true });
    expect(JSON.stringify(bodies[0].tools)).toContain("urlContext");
    expect(JSON.stringify(bodies[0].contents)).toContain("오사카 일정");
  });
});
