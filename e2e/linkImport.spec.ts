import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

const imported = {
  found: true, productName: "오사카 교토 3일", agency: "노랑풍선", destination: "오사카, 일본", departureDate: "2027-01-04", nights: 2, days: 3,
  pricePerPerson: 899000, priceNote: "유류할증료 포함", hotel: "",
  outbound: { airline: "대한항공", flightNumber: "KE723", date: "2027-01-04", departAirport: "인천(ICN)", departTime: "10:00", arriveAirport: "간사이(KIX)", arriveTime: "12:00" },
  inbound: { airline: "대한항공", flightNumber: "KE724", date: "2027-01-06", departAirport: "간사이(KIX)", departTime: "20:00", arriveAirport: "인천(ICN)", arriveTime: "22:00" },
  mustSee: ["오사카성", "기요미즈데라"], included: [], excluded: [], shopping: 0, optionTours: [], guideFee: "", cancelPolicy: "",
  courseText: "제1일 인천 출발 ... 제3일 귀국", url: "https://pkgtour.naver.com/products/ybtour/X", readDirect: true, sources: [],
};
const item = (id: string, name: string, stay: number, type = "sightseeing") => ({ id, type, name, description: "", stayMinutes: stay, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: false, admission: "none" });
const day = (n: number, items: ReturnType<typeof item>[], rest?: string) => ({ day: n, theme: `Day ${n}`, kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: "오사카", ...(rest ? { rest } : {}) });

test("상품 링크: 읽고 → 이 상품 기준으로 우리 코스 → 판매가 역계산, 비어 온 도착일 오후는 자동으로 채운다", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/import-product", (r) => r.fulfill({ json: imported }));
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/generate-itinerary", async (r) => {
    sent = r.request().postDataJSON() as Record<string, unknown>;
    await r.fulfill({
      json: {
        // AI가 도착일을 비워 보냄 (예전엔 "전일 자유일정"이 되어 오후가 빈 채로 다음 날부터 투어)
        days: [day(1, [item("f1", "전일 자유일정", 480, "free_time")], "free"), day(2, [item("b1", "교토 기요미즈데라", 120)]), day(3, [item("c1", "구로몬 시장", 90), item("c2", "린쿠 아울렛", 120, "shopping")])],
        sources: [],
        researched: false,
      },
    });
  });
  await page.route("**/api/suggest-day-fill", (r) =>
    r.fulfill({
      json: {
        suggestions: [
          { name: "오사카성 공원", description: "", reason: "", stayMinutes: 90, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, caution: "", cuisine: "" },
          { name: "도톤보리 저녁", description: "", reason: "", stayMinutes: 90, travelMinutesToNext: 0, entryFee: 0, mealCost: 20000, caution: "", cuisine: "현지식" },
        ],
        sources: [],
        searched: true,
      },
    }),
  );
  await page.goto("/");
  const box = page.getByRole("region", { name: "상품 링크로 만들기" });
  await box.getByLabel("상품 링크").fill("https://pkgtour.naver.com/products/ybtour/JKP14657C00-20270104");
  await box.getByRole("button", { name: "읽기" }).click();
  await expect(box).toContainText("판매가 1인 ₩899,000");
  await expect(box).toContainText("1인 원가 예산");
  await box.getByRole("button", { name: "이 상품 기준으로 우리 코스 만들기" }).click();

  const d1 = page.locator("#day-1");
  await expect(d1).toContainText("오사카성 공원", { timeout: 30_000 });
  await expect(d1).not.toContainText("전일 자유일정");
  expect(sent).toMatchObject({ days: 3, mustHave: "오사카성, 기요미즈데라", flightDays: { arrive: "12:00", returnDepart: "20:00" } });
  // 판매가에서 시작 (역계산) — 경쟁 상품으로도 등록
  await expect(page.getByText("예산 사용표 (1인, 2인 1실 기준)")).toBeVisible({ timeout: 30_000 });
});

test("상품 링크: 그대로 가져오기도 링크의 항공 시각으로 첫날·마지막 날을 맞추고, 직접 못 읽은 상품은 경고·날짜별 줄 수", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/import-product", (r) =>
    r.fulfill({ json: { ...imported, readDirect: false, courseText: "제1일 (01/04)\n인천 출발\n간사이 도착\n오사카성\n제2일 (01/05)\n\n제3일 (01/06)\n구로몬 시장\n공항" } }),
  );
  let parsedText = "";
  await page.route("**/api/parse-course", async (r) => {
    parsedText = String((r.request().postDataJSON() as { text: string }).text);
    // 원문 분석 결과에 항공 시각이 없다 (예전엔 첫날이 08:00 출발로 시작했다)
    await r.fulfill({
      json: {
        days: [
          day(1, [item("p1", "인천공항 출발", 0, "flight"), item("p2", "간사이공항 도착", 0, "flight"), item("p3", "오사카성", 90)]),
          day(2, [item("p4", "교토 기요미즈데라", 120)]),
          { ...day(3, [item("p5", "구로몬 시장", 90), item("p6", "간사이공항 출발", 0, "flight"), item("p7", "인천공항 도착", 0, "flight")]), overnightCity: "" },
        ],
        meta: { packageName: "오사카 교토 3일", cities: ["오사카"], noShopping: false, noOption: false, hotelGrade: "", highlights: [], flight: null },
        nights: 2,
        totalDays: 3,
        quote: null,
      },
    });
  });
  await page.route("**/api/suggest-day-fill", (r) => r.fulfill({ json: { suggestions: [], sources: [], searched: false } }));
  await page.goto("/");
  const box = page.getByRole("region", { name: "상품 링크로 만들기" });
  await box.getByLabel("상품 링크").fill("https://pkgtour.naver.com/products/ybtour/JKP14657C00-20270104");
  await box.getByRole("button", { name: "읽기" }).click();
  await expect(box.getByRole("alert").first()).toContainText("직접 읽지 못해");
  await expect(box.getByLabel("날짜별 줄 수")).toContainText("2일 0줄");
  await box.getByRole("button", { name: "이 상품 코스 그대로 가져오기" }).click();

  const d1 = page.locator("#day-1");
  await expect(d1).toContainText("오사카성", { timeout: 30_000 });
  // 링크의 항공 시각(10:00 출발 → 12:00 도착)으로 시작, 08:00 출발이 아니다
  await expect(d1).toContainText("10:00");
  await expect(d1).toContainText("12:00");
  await expect(d1).not.toContainText("08:00");
  await expect(page.locator("#day-3")).toContainText("20:00");
  // 코스 분석에 보낸 원문 앞에 항공 줄이 붙는다
  expect(parsedText).toContain("KE723 인천(ICN) 10:00 출발 → 간사이(KIX) 12:00 도착");
});
