import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

// 불가능 시간 — 새벽 도착일에 호핑투어가 잡힌 사례 (사용자 제보). 빨간 점검과 [불가능 시간 고치기]

const it = (id: string, type: string, name: string, patch: Record<string, unknown> = {}) => ({ id, type, admission: "none", name, description: "", stayMinutes: 60, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: true, ...patch });
const day = (n: number, items: unknown[], patch: Record<string, unknown> = {}) => ({ day: n, theme: `DAY ${n}`, kind: "linear", overnightCity: "파타야", amGuided: [], pmFreeOptions: [], items, ...patch });

const DAYS = [
  day(1, [
    it("dep", "flight", "김해 국제공항 출발", { fixedTime: "20:30", stayMinutes: 0, travelMinutesToNext: 330 }),
    it("arr", "flight", "방콕 수안나품 공항 도착", { stayMinutes: 40, travelMinutesToNext: 100 }),
    it("tr", "transfer", "호텔로 이동", { stayMinutes: 0, travelMinutesToNext: 0 }),
    it("hop", "experience", "산호섬 호핑 투어", { stayMinutes: 180, travelMinutesToNext: 0 }),
    it("lunch-1-3", "meal", "점심 식사 (자유식)", { travelMinutesToNext: 50 }),
    it("h1", "hotel", "호텔 새벽 체크인", { stayMinutes: 0 }),
  ]),
  day(2, [it("temple", "sightseeing", "진리의 성전", { admission: "enter", stayMinutes: 80 }), it("l2", "meal", "중식 (무제한 삼겹살)"), it("h2", "hotel", "호텔 투숙", { stayMinutes: 0 })], { meetingTime: "09:00" }),
  day(3, [it("d3", "sightseeing", "농눗빌리지", { stayMinutes: 120 }), it("h3", "hotel", "호텔 투숙", { stayMinutes: 0 })], { meetingTime: "09:00" }),
];

test("새벽 도착일 관광은 빨간 불가능 시간으로 보이고, 고치면 같은 도시의 다른 날 오전으로 간다", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript((w) => {
    localStorage.setItem("semitour.autoEngineCheck", "0");
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ destination: "파타야", days: 3, nights: 2, travelers: 4, packageType: "land_hotel", lodgingType: "hotel", travelType: "package" }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, { days: DAYS, pmChoice: {}, meta: null, generatedCurrency: "KRW", usps: [], uspKey: null });
  await page.goto("/");

  const day1 = page.locator("#day-1");
  await day1.getByRole("button", { name: /이 날 확인할 것/ }).click();
  const hard = day1.getByRole("list", { name: "불가능 시간" });
  await expect(hard).toContainText("산호섬 호핑 투어 — 새벽·밤 도착일");
  await expect(hard).toContainText("점심 식사 (자유식)");
  await expect(day1).toContainText("이 날: 새벽·밤 도착일 (02:00 도착)");

  await day1.getByRole("button", { name: "불가능 시간 고치기" }).click();
  await expect(day1.getByRole("list", { name: "불가능 시간" })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}"));
  const where = (id: string) => saved.days.find((d: { items: { id: string }[] }) => d.items.some((i) => i.id === id))?.day;
  expect(where("hop")).toBeGreaterThan(1);
  expect(where("lunch-1-3")).toBeUndefined();
});
