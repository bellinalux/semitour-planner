import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

// 패키지 규칙표 — 운영 방식·등급 고르기, 상품 규칙 패널, 일정 카드 점검, 규칙대로 정리

const it = (id: string, type: string, name: string, patch: Record<string, unknown> = {}) => ({ id, type, admission: "none", name, description: "", stayMinutes: 60, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: true, ...patch });
const day = (n: number, items: unknown[], patch: Record<string, unknown> = {}) => ({ day: n, theme: `DAY ${n}`, kind: "linear", overnightCity: n < 3 ? "파타야" : "방콕", amGuided: [], pmFreeOptions: [], items, ...patch });

const DAYS = [
  day(1, [it("a", "sightseeing", "진리의 성전"), it("shop", "shopping", "라텍스 쇼핑센터")]),
  day(2, [it("mv", "transfer", "방콕으로 이동", { stayMinutes: 150, travelMinutesToNext: 10 }), it("b", "sightseeing", "왕궁"), it("cruise", "experience", "석식 (선상디너 크루즈)", { entryFee: 50000 })], { meetingTime: "07:30" }),
  day(3, [it("c", "sightseeing", "매끌렁 시장"), it("act", "experience", "해양 엑티비티", { description: "바나나 보트 - 가이드 문의 후 별도 진행 가능", entryFee: 16000 })]),
];

test("운영 방식·등급을 고르면 상품 규칙이 바뀌고, 규칙대로 정리한다", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript((w) => {
    localStorage.setItem("semitour.autoEngineCheck", "0");
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ destination: "파타야, 방콕", days: 3, nights: 2, travelers: 4, packageType: "land_hotel", lodgingType: "hotel", travelType: "package", tipPerPerson: 10 }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, { days: DAYS, pmChoice: {}, meta: null, generatedCurrency: "KRW", usps: [], uspKey: null });
  await page.goto("/");

  // 예전 저장값(여행 유형 패키지) → 풀패키지·스탠다드
  await expect(page.getByRole("radiogroup", { name: "운영 방식" }).getByRole("radio", { name: /풀패키지/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radiogroup", { name: "상품 등급" }).getByRole("radio", { name: /^프리미엄/ }).click();

  const panel = page.locator("#package-rules");
  await expect(panel).toContainText("풀패키지 · 프리미엄");
  await expect(panel).toContainText("동남아·중화권");
  await expect(panel.getByRole("table", { name: "상품 기준" })).toContainText("노쇼핑");
  await expect(panel.getByRole("list", { name: "상품 규칙 점검" })).toContainText("쇼핑센터 1회");

  // 일정 카드: 첫날 쇼핑센터·이른 석식
  const day1 = page.locator("#day-1");
  await day1.getByRole("button", { name: /이 날 확인할 것/ }).click();
  await expect(day1.getByRole("list", { name: "상품 규칙 점검" })).toContainText("첫날 쇼핑센터");

  await panel.getByRole("button", { name: "규칙대로 정리" }).click();
  await expect(panel.getByRole("status")).toContainText("규칙대로 정리했습니다");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}"));
  const ids = saved.days.flatMap((d: { items: { id: string }[] }) => d.items.map((i) => i.id));
  expect(ids).not.toContain("shop");
  expect(saved.days[1].meetingTime).toBe("09:00");
  expect(saved.days[1].items.find((i: { id: string }) => i.id === "cruise").type).toBe("meal");

  // 원문상 별도 진행 항목 → 선택관광으로 (현지 별도 결제·미참여 시 대체일정)
  await panel.getByRole("button", { name: "선택관광으로 옮기기" }).click();
  await expect(panel.getByRole("status")).toContainText("해양 엑티비티을(를) 선택관광으로 옮겼습니다");
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:input:v1") ?? "{}"))).options?.map((o: { name: string }) => o.name)).toEqual(["해양 엑티비티"]);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}"));
  expect(after.days[2].items.some((i: { id: string }) => i.id === "act")).toBe(false);
});
