import { expect, test } from "@playwright/test";
import { mockAi, mockBuild } from "./mocks";

const flight = {
  airline: "대한항공", flightNumber: "KE723", departDate: "2026-12-01", departAirport: "인천(ICN)", departTime: "10:00", arriveAirport: "간사이(KIX)", arriveTime: "12:00",
  stops: 0, duration: "2시간", price: 300000, basis: "searched", sourceName: "", link: "",
  returnFlightNumber: "KE724", returnDepartDate: "2026-12-03", returnDepartAirport: "간사이(KIX)", returnDepartTime: "20:00", returnArriveAirport: "인천(ICN)", returnArriveTime: "22:00", returnStops: 0, returnDuration: "2시간",
};
const item = (id: string, name: string, stay: number, type = "sightseeing") => ({
  id, type, name, description: "", stayMinutes: stay, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: false, admission: "none",
});
const day = (n: number, items: ReturnType<typeof item>[]) => ({ day: n, theme: `Day ${n}`, kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: "오사카" });

test("자동 구성: 항공편을 먼저 고르고, 12:00 도착·20:00 출국 시각에 맞춰 도착일·출국일도 관광으로 채운다", async ({ page }) => {
  await mockAi(page);
  await mockBuild(page);
  await page.route("**/api/search-flight-options", (r) => r.fulfill({ json: { flights: [flight], searched: true } }));
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/generate-itinerary", async (r) => {
    sent = r.request().postDataJSON() as Record<string, unknown>;
    await r.fulfill({
      json: {
        days: [
          day(1, [item("a1", "오사카성", 90), item("a2", "도톤보리", 90), item("a3", "저녁 식사", 60, "meal")]),
          day(2, [item("b1", "교토 기요미즈데라", 120), item("b2", "후시미 이나리", 120)]),
          day(3, [item("c1", "구로몬 시장", 90), item("c2", "점심", 60, "meal"), item("c3", "린쿠 아울렛", 120, "shopping")]),
        ],
        sources: [],
        researched: false,
      },
    });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem(
      "semitour-planner:input:v1",
      JSON.stringify({ destination: "오사카, 일본", originCity: "인천", days: 3, nights: 2, travelers: 4, includesFlights: true, tripScope: "overseas", departureDate: "2026-12-01" }),
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "자동 구성", exact: true }).click();

  // 코스 요청에 항공 시각으로 정한 도착일·출국일 시간이 들어간다
  await expect(page.locator("#day-1")).toContainText("오사카성", { timeout: 30_000 });
  expect(sent).toMatchObject({ days: 3, nights: 2, flightDays: { arrive: "12:00", arrivalStart: "13:40", returnDepart: "20:00", departureEnd: "16:00", assumed: false } });

  // 도착일: 12:00 도착 → 오후 관광 → 호텔 체크인
  const d1 = page.locator("#day-1");
  await expect(d1).toContainText("간사이(KIX) 도착");
  await expect(d1).toContainText("13:40");
  // 출국일: 체크아웃 → 관광 → 16:00 공항 이동 → 20:00 출발
  const d3 = page.locator("#day-3");
  await expect(d3).toContainText("린쿠 아울렛");
  await expect(d3).toContainText("16:00");
  await expect(d3).toContainText("20:00");
});

test("기간: 숙박을 바꾸면 일수가 따라가고, 일본처럼 가까운 노선의 2박4일은 경고하고 한 번에 고친다", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ destination: "오사카, 일본", originCity: "인천", days: 4, nights: 2, includesFlights: true, tripScope: "overseas" }));
  });
  await page.goto("/");
  const warning = page.getByRole("alert").filter({ hasText: "기내 1박이 생기지 않습니다" });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "2박 3일로 맞추기" }).click();
  await expect(page.locator("#days")).toHaveValue("3");
  await expect(warning).toBeHidden();
  // 숙박 3박으로 바꾸면 일수 4일
  await page.locator("#nights").fill("3");
  await expect(page.locator("#days")).toHaveValue("4");
});
