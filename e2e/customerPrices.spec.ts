import { expect, test } from "@playwright/test";
import { DAYS, mockAi } from "./mocks";

// 고객 제시용 가격: 4성 견적이면 A 3성·B 4성(추천)·C 5성, 인원별 요금표, 비교 견적서 인쇄 (원가·수익률은 문서에 없다)
const work = { days: DAYS, pmChoice: {}, meta: { packageName: "다낭 3일", cities: ["다낭"], noShopping: true, noOption: true, hotelGrade: "4성급", highlights: [] }, generatedCurrency: "KRW", usps: [], uspKey: null };

test("고객 제시용 가격: A/B/C안·인원별 요금표, 비교 견적서 인쇄", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.addInitScript((w) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem(
      "semitour-planner:input:v1",
      JSON.stringify({
        destination: "다낭",
        days: 3,
        nights: 2,
        travelers: 6,
        packageType: "land_hotel",
        lodgingType: "hotel",
        hotelGrade: "4",
        lodgingRatePerNight: 100000,
        vehicleCostPerDay: 150000,
        guideCostPerDay: 100000,
        costStatus: { vehicle: "confirmed", guide: "confirmed", lodging: "confirmed" },
      }),
    );
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, work);
  await page.goto("/");

  const panel = page.locator("#customer-prices");
  const plans = panel.getByRole("group", { name: "A/B/C안" });
  await expect(plans).toContainText("A안 · 3성급");
  await expect(plans).toContainText("B안 · 4성급추천");
  await expect(plans).toContainText("C안 · 5성급");
  const table = panel.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "B안 4성급" })).toBeVisible();
  await expect(table.getByRole("row", { name: /^6명지금/ })).toBeVisible();
  await expect(table.getByRole("row", { name: /^8명/ })).toContainText("차종 바뀜");

  await page.getByRole("button", { name: "비교 견적서 (A/B/C안·인원별)" }).click();
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole("checkbox").check();
    await confirm.getByRole("button", { name: "인쇄" }).click();
  }
  const doc = page.locator(".print-root");
  await expect(doc).toContainText("숙소 등급별 A/B/C안");
  await expect(doc).toContainText("B안 (추천)");
  await expect(doc).toContainText("인원별 1인 요금");
  await expect(doc).not.toContainText("수익률");
  await expect(doc).not.toContainText("원가");
});
