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
