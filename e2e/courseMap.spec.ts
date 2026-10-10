import { expect, test, type Page } from "@playwright/test";
import { mockAi } from "./mocks";

// 코스 지도 · 여러 날 지역 묶기 — 좌표가 있는 일정이면 날짜별 지도·거리, 같은 지역을 여러 날 가는 곳과 다시 나눈 안(적용·되돌리기),
// 인쇄 일정표의 코스 그림, 고객 웹 일정표의 날짜별 지도

const it = (id: string, name: string, lat: number, lng: number, patch: Record<string, unknown> = {}) => ({
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
  lat,
  lng,
  ...patch,
});
const day = (n: number, items: ReturnType<typeof it>[]) => ({ day: n, theme: `DAY ${n}`, kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], items });
const DAYS = [
  day(1, [it("a1", "한 시장", 16.068, 108.22), it("a2", "바나힐", 15.995, 107.996, { stayMinutes: 240 })]),
  day(2, [it("b1", "바나힐 골든브릿지", 15.998, 107.99), it("b2", "다낭 대성당", 16.061, 108.224)]),
  day(3, [it("c1", "린응사", 16.1, 108.277), it("c2", "미케 비치", 16.06, 108.247)]),
];
const work = { days: DAYS, pmChoice: {}, meta: { packageName: "다낭 지도 3일", cities: ["다낭"], noShopping: true, noOption: true, hotelGrade: "4성급", highlights: [] }, generatedCurrency: "KRW", usps: [], uspKey: null };
const input = { destination: "다낭", days: 3, nights: 2, travelers: 4, departureDate: "2026-11-05", vehicleCostPerDay: 150000, guideCostPerDay: 100000, pricingMode: "target_margin", targetMarginRate: 20 };

async function setup(page: Page, extraInput: Record<string, unknown> = {}) {
  await mockAi(page);
  await page.addInitScript(
    ([w, i]) => {
      window.print = () => undefined;
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("semitour-planner:input:v1", JSON.stringify(i));
      localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
    },
    [work, { ...input, ...extraInput }] as const,
  );
}

test("코스 지도: 날짜별 거리와 반복 지역을 보여 주고, 다시 나눈 안을 적용·되돌린다", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  const panel = page.locator("#course-map");
  await panel.getByRole("button", { name: /코스 지도 · 지역 묶기/ }).click();
  const days = panel.getByRole("radiogroup", { name: "지도에 보일 날" });
  await expect(days.getByRole("radio", { name: /DAY 1 .*km/ })).toBeVisible();
  await expect(panel.locator(".maplibregl-marker")).toHaveCount(6);
  // DAY 2만 보기
  await days.getByRole("radio", { name: /DAY 2/ }).click();
  await expect(panel.locator(".maplibregl-marker")).toHaveCount(2);

  const group = panel.getByRole("region", { name: "여러 날 지역 묶기" });
  await expect(group.getByRole("list", { name: "반복 이동 지역" })).toContainText("바나힐 주변");
  // 시내(한 시장·대성당·미케 비치)는 3일, 바나힐은 2일에 나눠 감
  await expect(group.getByLabel("전후 비교")).toContainText("반복 이동 3번 → 0번");
  await group.getByRole("button", { name: "이 안으로 적용" }).click();
  await expect(group).toContainText("같은 지역을 여러 날 나눠 가는 곳이 없습니다");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}").days.map((d: { items: { name: string }[] }) => d.items.map((i) => i.name)));
  const dayOf = (name: string) => saved.findIndex((d: string[]) => d.includes(name));
  expect(dayOf("바나힐")).toBe(dayOf("바나힐 골든브릿지"));
  expect(new Set([dayOf("한 시장"), dayOf("다낭 대성당"), dayOf("미케 비치")]).size).toBe(1);

  // 되돌리기 (전체 되돌리기 기록에 '지역 묶기'로 쌓인다)
  await page.keyboard.press("Control+z");
  await expect(group.getByRole("list", { name: "반복 이동 지역" })).toBeVisible();
});

test("인쇄 일정표에 날짜별 코스 그림이 들어간다", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^여행일정표/ }).first().click();
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole("checkbox").check();
    await confirm.getByRole("button", { name: "인쇄" }).click();
  }
  const doc = page.locator(".print-root");
  await expect(doc).toContainText("코스 그림");
  await expect(doc.locator('svg[aria-label="날짜별 코스 그림"] circle')).toHaveCount(6);
  await expect(doc).toContainText("DAY 1: 1.한 시장 2.바나힐");
});

test("고객 웹 일정표: 좌표가 있는 날은 '지도로 보기'를 펼치면 지도가 나온다", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  const box = page.getByRole("region", { name: "고객용 웹 일정표" });
  await box.getByRole("button", { name: "링크 만들기" }).click();
  const url = await box.getByRole("status").filter({ hasText: "/t/" }).getByRole("link").getAttribute("href");
  await page.goto(url!);
  const first = page.locator("article").first();
  await first.getByText("지도로 보기").click();
  await expect(first.locator(".maplibregl-marker")).toHaveCount(2);
});

const hotel = (name: string, coords: { lat: number; lng: number } | null) => ({ name, grade: "4성급", area: "", nearestStation: "", walkMinutes: 0, nightlyLow: 0, nightlyHigh: 0, priceBasis: "searched", mapUrl: "", ...(coords ?? {}) });

test("숙소를 동선 기준으로: 숙소 위치를 찾으면 날마다 숙소에서 출발·도착하고, 첫 장소까지 이동 시간을 맞춘다", async ({ page }) => {
  await setup(page, { selectedHotels: { 다낭: hotel("노보텔 다낭", null) } });
  let asked: unknown = null;
  await page.route("**/api/place-coords", async (r) => {
    asked = r.request().postDataJSON();
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ places: [{ name: "노보텔 다낭", lat: 16.077, lng: 108.223 }] }) });
  });
  await page.goto("/");
  const panel = page.locator("#course-map");
  await panel.getByRole("button", { name: /코스 지도 · 지역 묶기/ }).click();
  await panel.getByRole("button", { name: "숙소 위치 찾기" }).click();
  await expect(panel.getByRole("status")).toContainText("숙소 1곳의 위치를 찾았습니다");
  expect(asked).toMatchObject({ city: "다낭", names: ["노보텔 다낭"] });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:input:v1") ?? "{}").selectedHotels);
  expect(saved["다낭"]).toMatchObject({ lat: 16.077, lng: 108.223 });

  // 6곳 + 숙소 핀 (DAY 1 도착 1, DAY 2·3 출발·도착 2씩)
  await expect(panel.locator(".maplibregl-marker")).toHaveCount(11);
  // DAY 2 첫 장소(바나힐골든브릿지)는 숙소에서 멀어 30분보다 길다
  const leads = panel.getByRole("list", { name: "숙소에서 첫 장소까지" });
  await expect(leads).toContainText("DAY 2 노보텔 다낭 → 바나힐 골든브릿지");
  await leads.getByRole("button").first().click();
  await expect(panel.getByRole("status")).toContainText("숙소에서 첫 장소까지를");
  const lead = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}").days[1].hotelLeadMinutes);
  expect(lead).toBeGreaterThan(30);
});
