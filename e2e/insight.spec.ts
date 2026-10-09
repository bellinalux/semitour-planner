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
