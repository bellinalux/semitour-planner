import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

// 시차·출발지 — 김해 출발 업체 코스를 읽었는데 출발지는 인천인 상품 (사용자 제보)

const it = (id: string, type: string, name: string, patch: Record<string, unknown> = {}) => ({ id, type, admission: "none", name, description: "", stayMinutes: 60, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: true, ...patch });
const day = (n: number, items: unknown[], patch: Record<string, unknown> = {}) => ({ day: n, theme: `DAY ${n}`, kind: "linear", overnightCity: "파타야", amGuided: [], pmFreeOptions: [], items, ...patch });

const DAYS = [
  day(1, [
    it("dep", "flight", "김해 국제 공항 출발", { fixedTime: "19:50", stayMinutes: 0, travelMinutesToNext: 340 }),
    it("arr", "flight", "방콕 수안나품 국제공항 도착", { description: "B게이트 나와서 4번 출구 쪽 미팅피켓", stayMinutes: 40, travelMinutesToNext: 100 }),
    it("h1", "hotel", "호텔 새벽 체크인", { stayMinutes: 0 }),
  ]),
  day(2, [it("temple", "sightseeing", "진리의 성전", { admission: "enter", stayMinutes: 80 }), it("l2", "meal", "중식 (무제한 삼겹살)"), it("h2", "hotel", "호텔 투숙", { stayMinutes: 0 })], { meetingTime: "09:00" }),
  day(3, [it("out", "flight", "방콕 수안나품 국제공항 출발", { fixedTime: "23:50", stayMinutes: 0, travelMinutesToNext: 300 }), it("in", "flight", "김해 국제공항 도착", { stayMinutes: 0 })], { overnightCity: "" }),
];

test("시각 앞 나라·비행/지상 이동 문구, 출발 공항이 다르면 맞추기, 규칙대로 정리로 시차 반영", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript((w) => {
    localStorage.setItem("semitour.autoEngineCheck", "0");
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ destination: "파타야", days: 3, nights: 1, travelers: 4, packageType: "land_hotel", lodgingType: "hotel", travelType: "package", originCity: "인천" }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, { days: DAYS, pmChoice: {}, meta: null, generatedCurrency: "KRW", usps: [], uspKey: null });
  await page.goto("/");

  const day1 = page.locator("#day-1");
  // 시각 앞 나라 — 출발은 한국, 도착 뒤는 태국
  await expect(day1.getByText("한국", { exact: true })).toBeVisible();
  await expect(day1.getByText("태국", { exact: true }).first()).toBeVisible();
  // 도착 뒤 100분은 비행이 아니라 지상 이동
  await expect(day1.getByText("공항에서 다음 장소까지 이동 1시간 40분")).toBeVisible();
  await expect(page.locator("#day-2")).toContainText("현지 시각 · 태국 (한국보다 2시간 느림)");

  // 출발 공항: 일정 김해 · 입력 인천 → 출발지를 김해로
  const panel = page.locator("#package-rules");
  await expect(panel.getByRole("list", { name: "상품 규칙 점검" })).toContainText("일정 김해 출발 · 입력 출발지 인천");
  await panel.getByRole("button", { name: "출발지를 김해(으)로" }).click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:input:v1") ?? "{}"))).originCity).toBe("김해");

  // 규칙대로 정리 — 비행 5시간 40분 + 시차 −2시간 → 방콕 현지 23:30 도착
  await panel.getByRole("button", { name: "규칙대로 정리" }).click();
  await expect(panel.getByRole("status")).toContainText("항공 비행시간·시차 다시 계산");
  await expect(day1.getByText(/비행 5시간 40분 \(노선 추정\) · 시차 −2시간/)).toBeVisible();
  await expect(day1.getByText("23:30 – 00:10")).toBeVisible();
});
