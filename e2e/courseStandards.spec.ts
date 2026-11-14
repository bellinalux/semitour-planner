import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

const item = (id: string, name: string, stay: number, travel: number, type = "sightseeing"): Record<string, unknown> => ({ id, type, name, description: "", stayMinutes: stay, travelMinutesToNext: travel, entryFee: 0, mealCost: 0, isEstimated: true, admission: "enter" });
const day = (n: number, items: Record<string, unknown>[]) => ({ day: n, theme: `Day ${n}`, kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: "다낭", meetingTime: "09:00" });

test("코스 기준: 20명 단체 여유·표준 체류를 요약·추천에서 한 번에 고치고, 일정 카드에 체류 근거가 보인다", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await mockAi(page);
  await page.route("**/api/parse-course", (r) =>
    r.fulfill({
      json: {
        days: [day(1, [item("a", "바나힐 테마파크", 60, 30, "experience"), item("b", "오행산", 60, 30), item("c", "한 시장", 60, 0)]), day(2, [item("d", "린응사", 45, 0)]), day(3, [item("e", "미케 비치", 30, 0)])],
        meta: { packageName: "다낭", cities: ["다낭"], noShopping: true, noOption: false, hotelGrade: "", highlights: [], flight: null },
        nights: 2,
        totalDays: 3,
        quote: null,
      },
    }),
  );
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ destination: "다낭", mode: "paste", days: 3, nights: 2, travelers: 20, courseText: "DAY 1 바나힐 오행산 한시장\nDAY 2 린응사\nDAY 3 미케" }));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "코스 분석", exact: true }).click();
  await expect(page.locator("#day-1")).toContainText("바나힐 테마파크", { timeout: 30_000 });
  await expect(page.locator("#day-1")).toContainText("AI 추정");

  const panel = page.getByRole("complementary", { name: "요약 · 추천" });
  const more = panel.getByRole("button", { name: /모두 보기|더 보기|개 더/ });
  if (await more.isVisible().catch(() => false)) await more.click();
  const buffer = panel.getByRole("listitem").filter({ hasText: "20명 단체 여유 시간 빠짐" });
  await expect(buffer).toBeVisible();
  await buffer.getByRole("button", { name: "+10분씩 더하기" }).click();
  await expect(page.locator("#day-1")).toContainText("+단체 10분");

  const stay = panel.getByRole("listitem").filter({ hasText: "체류 시간이 표준과 크게 다른 곳" });
  await expect(stay).toContainText("바나힐 테마파크 60분");
  await stay.getByRole("button", { name: "표준 시간으로 맞추기" }).click();
  await expect(page.locator("#day-1")).toContainText("표준표");
});

test("장소 담아 자동 배치: 담은 장소로 날짜별 일정을 만든다", async ({ page }) => {
  await mockAi(page);
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/place-cart", async (r) => {
    sent = r.request().postDataJSON() as Record<string, unknown>;
    await r.fulfill({
      json: {
        days: [day(1, [item("p1", "다자이후 텐만구", 90, 30), { ...item("l1", "점심 식사 (현지식)", 60, 20, "meal"), mealSlot: "lunch" }, item("p2", "후쿠오카 타워", 60, 0)]), day(2, [item("p3", "유후인 민예촌", 90, 0)])],
        dropped: [],
        matrix: "ors",
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("여행지").fill("후쿠오카");
  await page.getByText("장소 담아 자동 배치").click();
  await page.getByLabel("담을 장소").fill("다자이후 텐만구\n후쿠오카 타워\n유후인 민예촌");
  await page.getByRole("button", { name: "자동 배치" }).click();
  await expect(page.getByText(/2일에 3곳을 배치했습니다 \(이동: 무료 도로 경로\)/)).toBeVisible();
  await expect(page.locator("#day-1")).toContainText("다자이후 텐만구");
  await expect(page.locator("#day-2")).toContainText("유후인 민예촌");
  expect(sent).toMatchObject({ places: ["다자이후 텐만구", "후쿠오카 타워", "유후인 민예촌"], city: "후쿠오카" });
});
