import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

test("휴대폰: 가로로 넘치지 않고, 상단 메뉴가 한 줄에 들어간다", async ({ page }) => {
  await mockAi(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "일정·견적 생성" })).toBeVisible();

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

  // 아래 탭으로 결과·설정을 오갈 수 있다
  await page.getByRole("tab", { name: "설정" }).click();
  await expect(page.getByText("자동 견적 — 빈 값 한 번에 채우기")).toBeVisible();
});
