import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

// 레이아웃3(요약·추천): 넓은 화면은 오른쪽 3칸째, 노트북은 결과 위 접이, 휴대폰은 '추천' 탭
test("넓은 화면: 오른쪽 요약·추천 칸에 핵심 숫자와 추천, 추천 버튼으로 입력 폴더를 연다", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await mockAi(page);
  await page.goto("/");
  const panel = page.getByRole("complementary", { name: "요약 · 추천" });
  await expect(panel.getByText("아직 견적이 없습니다")).toBeVisible();

  await page.getByLabel("여행지").fill("다낭");
  await page.getByRole("button", { name: "코스만" }).click();
  await expect(panel.getByRole("region", { name: "핵심 숫자" })).toContainText("1인 원가");
  // 비어 있는 차량·가이드비 → '입력에서 채우기'가 4번 폴더를 연다
  await panel.getByRole("listitem").filter({ hasText: "차량·가이드비가 비어 있습니다" }).getByRole("button", { name: "입력에서 채우기" }).click();
  await expect(page.getByRole("button", { name: /4\. 원가 직접 입력/ })).toHaveAttribute("aria-expanded", "true");
});

test("노트북 너비: 결과 위에 '요약 · 추천' 접이가 있다", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await mockAi(page);
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "요약 · 추천" })).toBeHidden();
  await expect(page.getByRole("region", { name: "결과" }).getByRole("button", { name: /요약 · 추천/ })).toBeVisible();
});

test("휴대폰: 입력·결과·추천 3개 탭", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockAi(page);
  await page.goto("/");
  await page.getByRole("tab", { name: /추천/ }).click();
  await expect(page.getByRole("complementary", { name: "요약 · 추천" }).getByText("아직 견적이 없습니다")).toBeVisible();
});

test("코스를 만들면 타업체 상품을 자동으로 찾아 비교하고, 우리가 나은 점·경쟁 상품이 나은 점을 보여 준다", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await mockAi(page);
  await page.goto("/");
  const panel = page.getByRole("complementary", { name: "요약 · 추천" });
  await page.getByLabel("여행지").fill("다낭");
  await page.getByRole("button", { name: "코스만" }).click();

  await expect(panel.getByRole("status").filter({ hasText: /타업체 상품 2개를 찾아 투어 비교표에 넣었습니다/ })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole("listitem").filter({ hasText: /타업체 2곳 비교 — 우리가 나은 점 \d+개 · 경쟁 상품이 나은 점 \d+개/ })).toBeVisible();

  const compare = page.locator("#tour-compare");
  await expect(compare.getByText("우리가 나은 점", { exact: true })).toBeVisible();
  await expect(compare.getByText("경쟁 상품이 나은 점 (보완할 곳)")).toBeVisible();
  await expect(compare.getByRole("row", { name: /우리에겐 없는 곳/ })).toBeVisible();
});
