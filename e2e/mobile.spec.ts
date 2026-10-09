import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

test("휴대폰: 가로로 넘치지 않고, 상단 메뉴가 한 줄에 들어간다", async ({ page }) => {
  await mockAi(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "자동 구성", exact: true })).toBeVisible();

  const { docWidth, viewport, headerBottom, headerHeight } = await page.evaluate(() => {
    const header = document.querySelector("header")!;
    const items = [...header.querySelectorAll(":scope > div:last-child > *")].filter((e) => e.getBoundingClientRect().width > 0);
    return {
      docWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      headerBottom: Math.max(...items.map((e) => e.getBoundingClientRect().right)),
      headerHeight: header.getBoundingClientRect().height,
    };
  });
  expect(docWidth).toBeLessThanOrEqual(viewport);
  expect(headerBottom).toBeLessThanOrEqual(viewport);
  expect(headerHeight).toBeLessThanOrEqual(56);

  // 탭은 입력·결과 2개 — 입력은 번호 붙은 폴더(1~3 펼침, 4~6 접힘)
  await expect(page.getByRole("tab")).toHaveText(["입력", "결과"]);
  await expect(page.getByRole("button", { name: /1. 여행 기본/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /4. 원가 직접 입력/ })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("tab", { name: "결과" }).click();
  await expect(page.getByRole("tab", { name: "결과" })).toHaveAttribute("aria-selected", "true");
});
