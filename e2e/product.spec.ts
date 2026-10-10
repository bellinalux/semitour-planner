import { expect, test, type Page } from "@playwright/test";
import { mockAi } from "./mocks";

// 상품 만들기 기능 — 운영 기능 기본 숨김, 휴무일 피하기, 활동 강도, 등급 라인업, 변형, 박수 바꾸기, 자유시간 선택관광, 차별화, 장소 사진

const sight = (id: string, name: string, patch: Record<string, unknown> = {}) => ({ id, type: "sightseeing", admission: "enter", name, description: "", stayMinutes: 60, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: true, ...patch });
const lunch = (id: string) => ({ id, type: "meal", admission: "none", name: "점심 식사", description: "", stayMinutes: 60, travelMinutesToNext: 20, entryFee: 0, mealCost: 20000, isEstimated: true });
const day = (n: number, items: unknown[], patch: Record<string, unknown> = {}) => ({ day: n, theme: `DAY ${n}`, kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], items, ...patch });

const DAYS = [
  day(1, [sight("m", "참 박물관", { openHours: { mon: "closed", tue: "09:00-17:00", wed: "09:00-17:00" } }), lunch("l1"), sight("a", "한 시장")]),
  day(2, [sight("b", "바나힐"), lunch("l2"), sight("c", "용다리")]),
  day(3, [sight("d", "린응사")], { rest: "pmfree" }),
  day(4, [sight("e", "미케 비치")]),
];
const competitor = (agency: string, places: string[]) => ({
  id: agency,
  name: `${agency} 다낭 4일`,
  price: 500000,
  includes: { guide: true, meals: true, admission: true, vehicle: true, hotel: true, flight: false },
  shopping: "unknown",
  optionTour: "unknown",
  note: "",
  source: { agency, url: "https://example.com", sourceName: agency, basis: "searched", foundAt: "" },
  itinerary: { found: true, days: [{ day: 1, title: "", places, meals: { breakfast: "", lunch: "", dinner: "" }, hotel: "", free: false }] },
});
const INPUT = {
  destination: "다낭",
  days: 4,
  nights: 3,
  travelers: 4,
  departureDate: "2026-11-02",
  packageType: "land_hotel",
  lodgingType: "hotel",
  hotelGrade: "4",
  lodgingRatePerNight: 100000,
  vehicleCostPerDay: 150000,
  guideCostPerDay: 100000,
  pricingMode: "target_margin",
  targetMarginRate: 20,
  competitors: [competitor("하나투어", ["바나힐", "오행산"]), competitor("모두투어", ["바나힐", "오행산"])],
};

async function seed(page: Page, showOps = false) {
  await mockAi(page);
  await page.addInitScript(
    ([w, i, ops]) => {
      localStorage.setItem("semitour-planner:showOps", ops ? "1" : "0");
      localStorage.setItem("semitour.autoEngineCheck", "0");
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("semitour-planner:input:v1", JSON.stringify(i));
      localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
    },
    [{ days: DAYS, pmChoice: {}, meta: null, generatedCurrency: "KRW", usps: [], uspKey: null }, INPUT, showOps] as const,
  );
}
const work = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}"));
const savedInput = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:input:v1") ?? "{}"));

test("운영 기능은 기본으로 숨기고, 더보기에서 켠다", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.locator("#documents")).toBeAttached();
  await expect(page.getByRole("button", { name: "예약 관리" })).toHaveCount(0);
  await expect(page.locator("#ops-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "더보기" }).click();
  await page.getByRole("switch", { name: /운영 기능 보기/ }).click();
  await expect(page.getByRole("button", { name: "예약 관리" })).toBeVisible();
  await expect(page.locator("#ops-panel")).toBeAttached();
});

test("휴무일 피하기·활동 강도", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  const day1 = page.locator("#day-1");
  await expect(day1.getByText(/쉬움|보통|많이 걸음/).first()).toBeVisible();
  await day1.getByRole("button", { name: /이 날 확인할 것/ }).click();
  await expect(day1).toContainText("참 박물관 — DAY 1은(는) 월요일 휴무입니다");
  await day1.getByRole("button", { name: /DAY \d로 옮기기/ }).click();
  await expect.poll(async () => (await work(page)).days[0].items.some((i: { id: string }) => i.id === "m")).toBe(false);
});

test("상품 등급 라인업 — 프리미엄으로 바꾸기", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  const panel = page.locator("#lineup");
  await panel.getByRole("button", { name: /상품 등급 라인업/ }).click();
  const table = panel.getByRole("table", { name: "등급 라인업" });
  await expect(table).toContainText("실속");
  await expect(table).toContainText("프리미엄");
  await table.getByRole("row").filter({ hasText: "프리미엄" }).getByRole("button", { name: "이 등급으로" }).click();
  await expect.poll(async () => (await savedInput(page)).hotelGrade).toBe("5");
});

test("경쟁 상품 대비 차별화 — 빠진 인기 장소 넣기, USP", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  const panel = page.locator("#differentiation");
  await panel.getByRole("button", { name: /경쟁 상품 대비 차별화/ }).click();
  await expect(panel.getByRole("list", { name: "우리만 있는 곳" })).toContainText("참 박물관");
  const missing = panel.getByRole("list", { name: "빠진 인기 장소" });
  await expect(missing).toContainText("오행산");
  await expect(panel.getByRole("list", { name: "USP 문구" })).toContainText("다른 여행사 상품에 없는");
  await missing.getByRole("listitem").filter({ hasText: "오행산" }).getByRole("button", { name: "넣기" }).click();
  await expect.poll(async () => (await work(page)).days.flatMap((d: { items: { name: string }[] }) => d.items.map((i) => i.name))).toContain("오행산");
});

test("박수 바꾸기 — 하루 줄이기", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await page.getByRole("button", { name: /박수 바꾸기 \(3박 4일\)/ }).click();
  await page.getByRole("menuitem", { name: /2박 3일로/ }).click();
  await expect.poll(async () => (await work(page)).days.length).toBe(3);
  expect(await savedInput(page)).toMatchObject({ days: 3, nights: 2 });
});

test("자유시간 선택관광·장소 사진", async ({ page }) => {
  await seed(page);
  await page.route("**/api/place-photos", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ photos: [{ name: "바나힐", url: "https://upload.wikimedia.org/x/banahill.jpg", credit: "사진: Someone · CC BY-SA 4.0 · 위키미디어 공용" }] }) }),
  );
  await page.goto("/");
  // 지식 창고에 다른 여행사 일정으로 후보를 쌓는다
  await page.request.post("/api/knowledge/learn", { data: { kind: "competitor", city: "다낭", agency: "노랑풍선", title: "다낭", days: [["오행산", "호이안 올드타운"]] } });
  await page.reload();
  const free = page.locator("#free-options");
  await free.getByRole("button", { name: /자유시간 선택관광/ }).click();
  const slot = free.getByRole("list", { name: "자유시간" }).getByRole("listitem").filter({ hasText: "DAY 3" });
  await slot.getByRole("button", { name: /^\+ / }).first().click();
  await expect.poll(async () => (await savedInput(page)).options.some((o: { dayNo: number }) => o.dayNo === 3)).toBe(true);

  await page.getByRole("button", { name: /장소 사진 넣기/ }).click();
  await expect(page.getByText(/장소 1곳에 사진을 넣었습니다/)).toBeVisible();
  const items = (await work(page)).days.flatMap((d: { items: { name: string; photoUrl?: string }[] }) => d.items);
  expect(items.find((i: { name: string }) => i.name === "바나힐")?.photoUrl).toBe("https://upload.wikimedia.org/x/banahill.jpg");
});

test("고객 유형별 변형 — 원래 상품을 저장하고 시니어판으로 다시 만든다", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await page.getByRole("button", { name: "고객 유형별 변형" }).click();
  await page.getByRole("menuitem", { name: /시니어판/ }).click();
  await expect(page.getByText(/시니어판을\(를\) 만들었습니다\. 원래 상품은/)).toBeVisible({ timeout: 20_000 });
  expect(await savedInput(page)).toMatchObject({ companions: ["senior"], pace: "relaxed", travelType: "senior" });
});
