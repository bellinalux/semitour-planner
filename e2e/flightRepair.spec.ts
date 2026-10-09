import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

const item = (id: string, patch: Record<string, unknown>) => ({
  id,
  type: "sightseeing",
  admission: "none",
  name: id,
  description: "",
  stayMinutes: 60,
  travelMinutesToNext: 10,
  entryFee: 0,
  mealCost: 0,
  isEstimated: true,
  ...patch,
});

// 예전에 만든(잘못된) 일정이 브라우저에 저장돼 있는 상황: 도착 항목 하나가 09:50에 놓이고 비행 20분
const brokenWork = {
  days: [
    {
      day: 1,
      theme: "인천 → 마카오",
      kind: "linear",
      overnightCity: "마카오",
      meetingTime: "09:50",
      amGuided: [],
      pmFreeOptions: [],
      items: [
        item("d1-i1", {
          type: "flight",
          name: "마카오 공항 도착 ( 12:50 ), 가이드 미팅",
          description: "제주항공 (09:50 ~ 12:50) 이용 마카오 공항 도착 후 가이드 미팅",
          stayMinutes: 40,
          travelMinutesToNext: 20,
        }),
        item("d1-i2-free-0", {
          type: "free_time",
          name: "자유시간",
          description: "다음 식사 시간에 맞춰 비워 둔 자유시간입니다.",
          stayMinutes: 150,
          travelMinutesToNext: 0,
        }),
        item("d1-i2", { type: "meal", name: "점심 식사 (굴국수)", stayMinutes: 50, mealCost: 10000 }),
      ],
    },
    { day: 2, theme: "마카오", kind: "linear", overnightCity: "마카오", amGuided: [], pmFreeOptions: [], items: [item("d2-i1", { name: "콜로안 빌리지" })] },
  ],
  pmChoice: {},
  meta: null,
  generatedCurrency: "KRW",
  usps: [],
  uspKey: null,
};

test("이미 만든 일정표: 다시 열면 항공 시각을 원문 시각(09:50 → 12:50)으로 바로잡는다", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript((work) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ mode: "paste", destination: "마카오", days: 2, nights: 1, travelers: 4 }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(work));
  }, brokenWork);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "항공 출발" })).toBeVisible();
  await expect(page.getByText("09:50 – 09:50")).toBeVisible();
  await expect(page.getByText("12:50 – 13:30")).toBeVisible(); // 마카오 도착 12:50, 가이드 미팅 40분
  await expect(page.getByText("13:50 – 14:40")).toBeVisible(); // 점심 — 예전 시각 기준 자유시간은 빠진다
});
