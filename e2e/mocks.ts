import type { Page } from "@playwright/test";

/** AI를 부르는 API를 가짜 응답으로 바꿔 끼운다 — 비용 없이, 늘 같은 결과로 화면 흐름만 본다 */

const item = (id: string, name: string, patch: Record<string, unknown> = {}) => ({
  id,
  type: "sightseeing",
  admission: "enter",
  name,
  description: `${name} 설명`,
  stayMinutes: 60,
  travelMinutesToNext: 15,
  entryFee: 0,
  mealCost: 0,
  isEstimated: true,
  ...patch,
});

const day = (n: number, items: ReturnType<typeof item>[]) => ({ day: n, theme: `DAY ${n} 다낭 핵심`, kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], items });

/** 3일 일정. 첫 코스는 45분 체류 → 시각이 10분 단위로 끊기는지 본다(08:00–08:50) */
export const DAYS = [
  day(1, [
    item("d1a", "다낭 대성당", { stayMinutes: 45, travelMinutesToNext: 10, entryFee: 0 }),
    item("d1b", "한 시장", { stayMinutes: 70, travelMinutesToNext: 15 }),
    item("d1c", "마담 란", { type: "meal", admission: "none", stayMinutes: 60, mealCost: 15000 }),
  ]),
  day(2, [item("d2a", "바나힐", { stayMinutes: 240, entryFee: 50000 }), item("d2b", "아라팡 뷔페", { type: "meal", admission: "none", mealCost: 20000 })]),
  day(3, [item("d3a", "오행산", { stayMinutes: 90, entryFee: 10000 }), item("d3b", "호이안 올드타운", { stayMinutes: 120, entryFee: 12000 })]),
];

const competitor = (agency: string, price: number) => ({
  agency,
  productName: `${agency} 다낭 3일`,
  pricePerPerson: price,
  priceNote: "",
  nights: 2,
  days: 3,
  hotelGrade: "",
  includes: { guide: true, meals: true, admission: true, vehicle: true, hotel: false, flight: false },
  noShopping: true,
  noOption: true,
  policyUnknown: false,
  highlight: "",
  basis: "searched",
  sourceName: agency,
  searchUrl: "https://example.com",
  linkIsDirect: false,
});

export async function mockAi(page: Page) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/generate-itinerary", (r) => r.fulfill(json({ days: DAYS, sources: [], researched: false })));
  await page.route("**/api/generate-usp", (r) => r.fulfill(json({ usps: [{ title: "노쇼핑", reason: "쇼핑 없이 관광만" }] })));
  await page.route("**/api/estimate-ground", (r) =>
    r.fulfill(json({ vehicleCostPerDay: 100000, guideCostPerDay: 80000, vehicleNote: "7인승", guideNote: "한국어 가이드", searched: true, sources: [] })),
  );
  await page.route("**/api/estimate-travel", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "e2e" } }) }));
  await page.route("**/api/verify-fees", async (r) => {
    const req = r.request().postDataJSON() as { items: { id: string }[] };
    await r.fulfill(
      json({
        results: req.items.map((i) => ({ id: i.id, status: "confirmed", localCurrency: "KRW", localAmount: 15000, amountInQuote: 15000, sourceName: "공식", note: "", recommendedStayMinutes: 60, shouldBeMeal: false })),
        sources: [],
        searched: true,
        checkedAt: new Date().toISOString(),
        fx: [],
      }),
    );
  });
  await page.route("**/api/find-competitors", (r) => r.fulfill(json({ products: [competitor("하나투어", 450000), competitor("모두투어", 480000)], sources: [], searched: true, searchedAt: new Date().toISOString() })));
  await page.route("**/api/fx**", (r) => r.fulfill(json({ krwPerUnit: 1 })));
  // 의견·속도 기록 등 서버 저장 API는 로컬(잠금 꺼짐)에서 403 — 그대로 둔다
}

const hotelCandidate = (name: string, low: number, high: number) => ({
  name,
  grade: "4성급",
  area: "미케 비치",
  nearestStation: "",
  walkMinutes: 0,
  nightlyLow: low,
  nightlyHigh: high,
  priceBasis: "searched",
  koreanFriendly: true,
  koreanNote: "",
  highlights: "",
  mapUrl: "https://example.com",
});

const tourCandidate = (name: string, price: number) => ({
  name,
  category: "night",
  description: "",
  durationMinutes: 120,
  priceLow: price,
  priceHigh: price,
  priceBasis: "searched",
  includes: "",
  booking: "",
  koreanGuide: true,
  koreanNote: "",
  highlights: "",
  operator: "",
  sourceName: "클룩",
  searchUrl: "https://example.com",
});

/** 자동 구성에서 쓰는 숙소·투어 검색 */
export async function mockBuild(page: Page) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/find-hotels", (r) =>
    r.fulfill(json({ hotels: [hotelCandidate("싼 호텔", 50000, 70000), hotelCandidate("알맞은 호텔", 100000, 120000), hotelCandidate("비싼 호텔", 300000, 350000)], sources: [], searched: true, searchedAt: "" })),
  );
  await page.route("**/api/find-tours", (r) => r.fulfill(json({ tours: [tourCandidate("한강 야경 크루즈", 30000), tourCandidate("고가 헬기 투어", 900000)], sources: [], searched: true, searchedAt: "" })));
}
