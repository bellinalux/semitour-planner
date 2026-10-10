import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

// 일정 구성 정리 — 코스에 든 호텔 조식(불러올 때 뺌), 이어진 자유시간, 오전 자유인데 이른 미팅 (방콕 DAY 2 사례)

const it = (id: string, type: string, name: string, patch: Record<string, unknown> = {}) => ({ id, type, admission: "none", name, description: "", stayMinutes: 60, travelMinutesToNext: 0, entryFee: 0, mealCost: 0, isEstimated: true, ...patch });
const day = (n: number, items: unknown[], patch: Record<string, unknown> = {}) => ({ day: n, theme: `DAY ${n}`, kind: "linear", overnightCity: "방콕", amGuided: [], pmFreeOptions: [], items, ...patch });

const DAYS = [
  day(1, [it("a", "sightseeing", "왓 아룬", { travelMinutesToNext: 20 }), it("b", "sightseeing", "왓 포")]),
  day(
    2,
    [
      it("bf", "meal", "호텔 조식", { travelMinutesToNext: 10 }),
      it("pool", "free_time", "자유시간", { description: "호텔 수영장 및 부대시설 이용", stayMinutes: 150, travelMinutesToNext: 20 }),
      it("lunch-free-0", "free_time", "자유시간", { description: "다음 식사 시간에 맞춰 비워 둔 자유시간입니다.", stayMinutes: 40 }),
      it("lunch", "meal", "점심 식사", { travelMinutesToNext: 20 }),
      it("c", "sightseeing", "아이콘시암"),
    ],
    { meetingTime: "08:00" },
  ),
  day(3, [it("d", "sightseeing", "짜뚜짝 시장")]),
];

test("오전 자유 날 — 구성 정리하기로 조식 빼기·자유시간 한 줄·11:10 미팅", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript((w) => {
    localStorage.setItem("semitour.autoEngineCheck", "0");
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ destination: "방콕", days: 3, nights: 2, travelers: 4, packageType: "land_hotel", lodgingType: "hotel" }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, { days: DAYS, pmChoice: {}, meta: null, generatedCurrency: "KRW", usps: [], uspKey: null });
  await page.goto("/");

  const day2 = page.locator("#day-2");
  await day2.getByRole("button", { name: /이 날 확인할 것/ }).click();
  const issues = day2.getByRole("list", { name: "일정 구성 점검" });
  // 호텔 조식은 불러올 때 이미 빠진다 (일정 정리)
  await expect(day2.getByRole("textbox", { name: "항목 이름" }).filter({ hasText: "호텔 조식" })).toHaveCount(0);
  await expect(day2.getByRole("heading", { name: "호텔 조식" })).toHaveCount(0);
  await expect(issues).toContainText("자유시간이 연달아");
  await expect(issues).toContainText("11:10 호텔 로비 미팅");
  await day2.getByRole("button", { name: "구성 정리하기" }).click();

  await expect(day2.getByRole("list", { name: "일정 구성 점검" })).toHaveCount(0);
  await expect(day2.getByText("호텔 조식 후")).toBeVisible();
  await expect(day2.getByText(/11:10 호텔 로비 미팅 → 다음 장소까지 이동 20분/)).toBeVisible();
  await expect(day2.getByText("11:30 – 12:30")).toBeVisible();
  await expect(day2.getByLabel("오전 미팅 시각")).toHaveValue("11:10");
  await day2.screenshot({ path: test.info().outputPath("day2.png") });

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}"));
  expect(saved.days[1].items.map((i: { id: string }) => i.id)).toEqual(["pool", "lunch", "c"]);
});
