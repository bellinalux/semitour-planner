import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

// 화면을 끌어내려도 앱 아래에 빈 공간이 생기지 않는다 — 페이지 전체 높이는 화면 높이와 같고, 내용은 각 칸 안에서만 스크롤된다.
// (예전에는 화면에 안 보이는 선택 버튼(sr-only 라디오)이 칸 밖 기준으로 놓여 페이지가 3,600px까지 늘어났다)
for (const size of [
  { width: 1500, height: 900 },
  { width: 1200, height: 850 },
  { width: 375, height: 812 },
]) {
  test(`페이지 높이 = 화면 높이 (${size.width}×${size.height})`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockAi(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "자동 구성", exact: true })).toBeVisible();
    const { docHeight, viewport } = await page.evaluate(() => ({ docHeight: document.documentElement.scrollHeight, viewport: window.innerHeight }));
    expect(docHeight).toBeLessThanOrEqual(viewport);
  });
}
