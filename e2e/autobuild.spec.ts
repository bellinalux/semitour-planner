import { expect, test } from "@playwright/test";
import { mockAi, mockBuild } from "./mocks";

test("자동 구성: 판매가에서 시작 → 코스·예산 안 숙소·견적·추천 투어", async ({ page }) => {
  await mockAi(page);
  await mockBuild(page);
  // 판매가 1인 600,000원(직판), 회사 수익 15%, 랜드+숙박 2박 3일, 4명
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem(
      "semitour-planner:input:v1",
      JSON.stringify({ destination: "다낭", days: 3, nights: 2, travelers: 4, packageType: "land_hotel", pricingMode: "fixed_price", fixedPricePerPerson: 600000, targetMarginRate: 15, cardFeeRate: 3 }),
    );
  });
  await page.goto("/");

  // 입력 화면 아래의 주 버튼으로 시작한다
  await page.getByRole("button", { name: "자동 구성", exact: true }).click();
  await expect(page.getByText("08:00 – 08:50")).toBeVisible({ timeout: 30_000 });

  // 숙소: 원가 예산에서 나온 1실 1박 상한 안에서 고른다 (비싼 호텔은 상한 밖)
  await expect(page.getByText(/알맞은 호텔 \(1실 1박 상한/)).toBeVisible({ timeout: 30_000 });
  // 추천 투어: 남은 입장·투어 예산 안의 것만
  const autoPanel = page.locator("#settings-auto");
  await expect(autoPanel.getByText("한강 야경 크루즈")).toBeVisible({ timeout: 30_000 });
  await expect(autoPanel.getByText("고가 헬기 투어")).toHaveCount(0);

  // 입력 화면 버튼 옆에도 결과 한 줄이 보인다
  await expect(page.getByRole("status").filter({ hasText: "자동 구성 끝" })).toBeVisible({ timeout: 30_000 });

  // 견적에 예산 사용표가 나오고, 숙박 출처는 고른 숙소
  await expect(page.getByText("예산 사용표 (1인, 2인 1실 기준)")).toBeVisible();
  const costTable = page.locator("table", { has: page.locator("caption", { hasText: "원가 내역" }) });
  await expect(costTable.getByText("출처: 고른 숙소 · 알맞은 호텔")).toBeVisible();

  // 추천 투어를 판매가에 넣으면 일정에 들어간다
  await autoPanel.getByRole("button", { name: "판매가에 포함" }).click();
  await expect(page.getByRole("heading", { name: "한강 야경 크루즈" })).toBeVisible();

  // 원가 계산서(엑셀)와 투어 비교표: 경쟁 상품의 방문지 중 우리 일정과 겹치는 곳을 센다
  await expect(page.getByRole("button", { name: "엑셀로 내려받기" })).toBeVisible();
  const compare = page.locator("table", { has: page.locator("caption", { hasText: "투어 비교표" }) });
  await expect(compare.getByRole("columnheader", { name: /하나투어/ })).toBeVisible({ timeout: 30_000 });
  await expect(compare.getByText(/방문지 2곳 겹침/).first()).toBeVisible();
});
