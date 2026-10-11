import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

// 전체 일정 재구성 — 날마다 진단, 변경안 전·후 비교, 적용 / 상품 요약 지표

const it = (id: string, type: string | undefined, name: string, patch: Record<string, unknown> = {}) => ({ id, ...(type ? { type } : {}), admission: "none", name, description: "", stayMinutes: 60, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: true, ...patch });
const day = (n: number, items: unknown[], patch: Record<string, unknown> = {}) => ({ day: n, theme: `DAY ${n}`, kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], items, meetingTime: "09:00", ...patch });

// DAY 2가 넘치고(밤까지), DAY 1·3은 일찍 끝난다. 식당은 이름만 (AI 응답 모양)
const DAYS = [
  day(1, [it("a1", "sightseeing", "다낭 대성당"), it("l1", "meal", "마담란", { cuisine: "현지식" }), it("a2", "sightseeing", "미케 비치")]),
  day(2, [
    it("b1", "sightseeing", "바나힐", { stayMinutes: 300 }),
    it("l2", "meal", "아라팡 뷔페", { cuisine: "뷔페", travelMinutesToNext: 50 }),
    it("b2", "sightseeing", "오행산", { stayMinutes: 120, travelMinutesToNext: 30 }),
    it("cafe", "meal", "콩카페", { cuisine: "카페", stayMinutes: 50 }),
    it("b3", "sightseeing", "참 박물관", { stayMinutes: 120 }),
    it("d2", "meal", "벱꾸온", { cuisine: "현지식", stayMinutes: 80 }),
  ]),
  day(3, [it("c1", "sightseeing", "린응사"), it("l3", "meal", "모닝글로리", { cuisine: "현지식" })]),
];

test("재구성: 진단과 변경안 전·후 비교, 적용하면 넘치던 날이 줄어든다", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript((w) => {
    localStorage.setItem("semitour.autoEngineCheck", "0");
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ destination: "다낭", days: 3, nights: 2, travelers: 4, packageType: "land_hotel", lodgingType: "hotel", travelType: "package", operatingModel: "full", productTier: "standard" }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, { days: DAYS, pmChoice: {}, meta: null, generatedCurrency: "KRW", usps: [], uspKey: null });
  await page.goto("/");

  const panel = page.locator("#restructure");
  const diag = panel.getByRole("list", { name: "날마다 진단" });
  await expect(diag).toContainText(/DAY 2 · (넘침|불가능)/);
  await expect(panel.getByRole("table", { name: "변경 전후" })).toBeVisible();
  await expect(panel.getByRole("list", { name: "바뀌는 것" })).toContainText(/DAY 2 → DAY (1|3)|뺌/);

  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}"));
  const count = (w: { days: { items: unknown[] }[] }) => w.days[1].items.length;
  await panel.getByRole("button", { name: "이 안으로 바꾸기" }).click();
  await expect(panel.getByRole("status")).toContainText("으로 바꿨습니다");
  await expect.poll(async () => count(await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}")))).toBeLessThan(count(before));

  // 상품 요약 지표
  await expect(page.locator("#package-rules").getByRole("list", { name: "상품 요약" })).toContainText("하루 평균");
});
