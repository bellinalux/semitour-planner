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
  const summary = compare.getByRole("group", { name: "우리 vs 경쟁 상품 정리" });
  await expect(summary.getByText("우리가 나은 점", { exact: true })).toBeVisible();
  await expect(summary.getByText("경쟁 상품이 나은 점 (보완할 곳)")).toBeVisible();
  await expect(compare.getByRole("row", { name: /우리에겐 없는 곳/ })).toBeVisible();
});

test("상품 비교 보기: 경쟁 상품 일정을 가져와 날짜별 코스·금액·나은 점을 한 화면에서 본다", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await mockAi(page);
  await page.route("**/api/competitor-itinerary", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        itinerary: {
          found: true,
          days: [
            { day: 1, title: "", places: ["바나힐 테마파크", "린응사"], meals: { breakfast: "", lunch: "현지식", dinner: "불포함" }, hotel: "", free: false, otherRegion: "" },
            { day: 2, title: "", places: [], meals: { breakfast: "호텔식", lunch: "불포함", dinner: "불포함" }, hotel: "", free: true, otherRegion: "" },
          ],
          mealCount: 1,
          tipNote: "1인 USD 30 현지 지불",
          optionTours: [{ name: "바나힐 야경 투어", priceText: "1인 US$60" }],
          sourceName: "하나투어",
          checkedAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await page.goto("/");
  await page.getByLabel("여행지").fill("다낭");
  await page.getByRole("button", { name: "코스만" }).click();
  await expect(page.locator("#tour-compare")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "상품 비교 보기 (코스·금액 한눈에)" }).click();
  const dialog = page.getByRole("dialog", { name: /상품 비교 — 우리 vs 경쟁 상품 2개/ });
  await expect(dialog.getByText("날짜별 일정을 아직 가져오지 않았습니다 — 주요 방문지:").first()).toBeVisible();
  await dialog.getByRole("button", { name: "경쟁 상품 일정 가져오기 (2개)" }).click();
  await expect(dialog.getByRole("status")).toContainText("경쟁 상품 2개 중 2개의 날짜별 일정을 읽었습니다");
  const course = dialog.getByRole("region", { name: "날짜별 코스" });
  await expect(course.getByText("자유일정").first()).toBeVisible();
  await expect(course.getByText("린응사").first()).toBeVisible();
  await expect(dialog.getByRole("row", { name: /가이드 경비\(팁\)/ })).toContainText("1인 USD 30 현지 지불");
  await expect(dialog.getByRole("row", { name: /^선택관광/ })).toContainText("바나힐 야경 투어 · 1인 US$60");
  await expect(dialog.getByRole("region", { name: "상품별 정리" }).getByText("우리가 나은 점").first()).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "엑셀(CSV) 저장" }).click()]);
  expect(download.suggestedFilename()).toContain("상품비교");
});

test("가격 낮추기: 방법마다 판매가·경쟁 순위 변화를 보여 주고, 골라서 적용·되돌리기", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await mockAi(page);
  await page.goto("/");
  await page.getByLabel("여행지").fill("다낭");
  await page.getByRole("button", { name: "코스만" }).click();
  const levers = page.locator("#price-levers");
  await expect(levers).toBeVisible({ timeout: 30_000 });
  await expect(levers).toContainText(/지금 1인 ₩[\d,]+ · 같은 조건 3개 중 \d위/);
  await expect(levers).toContainText("쇼핑·선택관광을 늘려 메우는 방법은");

  const lever = levers.getByRole("listitem").filter({ hasText: "DAY 3 호이안 올드타운 빼기" });
  await expect(lever).toContainText("바로 적용");
  await expect(lever).toContainText("업계 기준:");
  await lever.getByRole("checkbox").check();
  await expect(levers.getByRole("status")).toContainText(/고른 1개를 함께 하면 1인 ₩[\d,]+/);
  await levers.getByRole("button", { name: "고른 것 적용" }).click();
  await expect(page.locator("#day-3")).not.toContainText("호이안 올드타운");
  await levers.getByRole("button", { name: "되돌리기" }).click();
  await expect(page.locator("#day-3")).toContainText("호이안 올드타운");
});
