import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

test.beforeEach(async ({ page }) => {
  await mockAi(page);
  await page.goto("/");
});

test("입력 폴더: 초기화는 한 번 더 확인하고, 견적 경고의 '입력에서 수정'은 해당 폴더를 연다", async ({ page }) => {
  const input = page.getByRole("complementary", { name: "입력" });
  await page.getByLabel("여행지").fill("다낭");

  // 초기화: 확인 창에서 취소하면 그대로
  await page.getByRole("button", { name: "초기화" }).click();
  const confirm = page.getByRole("alertdialog", { name: "초기화 확인" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "취소" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByLabel("여행지")).toHaveValue("다낭");

  // 코스를 만들면 차량·가이드비가 비어 있다는 경고 → '입력에서 수정'이 4. 원가 직접 입력 폴더를 연다
  const costFolder = input.getByRole("button", { name: /4\. 원가 직접 입력/ });
  await expect(costFolder).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "코스만" }).click();
  await page.getByRole("button", { name: "입력에서 수정" }).first().click();
  await expect(costFolder).toHaveAttribute("aria-expanded", "true");
  await expect(input.locator("#settings-cost")).toBeVisible();
});
