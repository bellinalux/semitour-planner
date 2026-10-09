import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

const item = (id: string, name: string, stay: number, travel: number, type = "sightseeing") => ({
  id,
  type,
  admission: "none",
  name,
  description: "",
  stayMinutes: stay,
  travelMinutesToNext: travel,
  entryFee: 0,
  mealCost: 0,
  isEstimated: true,
});

// 장소마다 따로 잡은 체류·이동으로 부푼 하루 (10:00 시작)
const work = {
  days: [
    {
      day: 1,
      theme: "마카오 역사지구",
      kind: "linear",
      overnightCity: "마카오",
      meetingTime: "10:00",
      amGuided: [],
      pmFreeOptions: [],
      items: [
        item("a1", "탑석광장", 30, 20),
        item("a2", "몬테요새", 60, 20),
        item("a3", "성바울 성당", 40, 20),
        item("a4", "세나도 광장", 40, 30),
        item("b1", "타이파 빌리지", 90, 20),
        item("b2", "쿤하 거리", 60, 0, "shopping"),
      ],
    },
  ],
  pmChoice: {},
  meta: null,
  generatedCurrency: "KRW",
  usps: [],
  uspKey: null,
};

test("일정 시간 검증: 하루 순서를 구역 단위로 확인해 체류·이동을 맞추고, 되돌릴 수 있다", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/verify-day-time", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        days: [
          {
            day: 1,
            searched: true,
            areas: [
              {
                name: "마카오 반도 역사지구",
                itemIds: ["a1", "a2", "a3", "a4"],
                totalMinutes: 120,
                walkMinutes: 5,
                travelToNextMinutes: 20,
                sourceName: "여행사 일정표",
              },
              { name: "타이파 빌리지", itemIds: ["b1", "b2"], totalMinutes: 90, walkMinutes: 3, travelToNextMinutes: 0, sourceName: "" },
            ],
          },
        ],
        sources: [],
        checkedAt: new Date().toISOString(),
      }),
    }),
  );
  await page.addInitScript((w) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ mode: "paste", destination: "마카오", days: 1, nights: 0, travelers: 4 }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, work);
  await page.goto("/");

  const day1 = page.locator("#day-1");
  await expect(day1).toContainText("~17:10 종료"); // 체류 320 + 이동 110 = 7시간 10분
  await day1.getByRole("button", { name: "시간 검증" }).click();
  // 역사지구 10:00–12:00 → 이동 20분 → 타이파 12:20–13:50
  await expect(day1).toContainText("~13:50 종료");
  await expect(day1.getByText(/구역 확인 · 마카오 반도 역사지구/).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "DAY 1 체류·이동 시간을 구역 기준으로 맞췄습니다" })).toBeVisible();

  await page.getByRole("button", { name: "되돌리기" }).first().click();
  await expect(day1).toContainText("~17:10 종료");
});
