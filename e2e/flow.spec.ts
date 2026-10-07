import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

test.beforeEach(async ({ page }) => {
  await mockAi(page);
  await page.goto("/");
});

test("입력 → 코스 → 자동 견적 → 인쇄 전 확인 → 예약 등록", async ({ page }) => {
  // ① 입력
  await page.getByLabel("여행지").fill("다낭");
  await page.getByRole("button", { name: "일정·견적 생성" }).click();

  // ② 코스: 시각은 10분 단위 (45분 체류 → 08:00–08:50, 다음 코스 09:00)
  await expect(page.getByText("08:00 – 08:50")).toBeVisible();
  await expect(page.getByText("09:00 – 10:10")).toBeVisible();
  const guide = page.getByRole("navigation", { name: "진행 단계" });
  await expect(guide.getByRole("button", { name: /코스.*3일 일정/ })).toBeVisible();

  // ③ 견적: 비어 있는 차량·가이드비가 있으니 단계 안내를 누르면 자동 견적이 돈다
  await guide.getByRole("button").nth(2).click(); // ③ 견적
  await expect(page.getByText(/추정값 \d+건을 채웠습니다/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("출처: 웹 검색").first()).toBeVisible();

  // 견적 보기: 기본은 요약, 자세히로 바꾸면 채널·할인 분석이 보인다
  await page.getByRole("radio", { name: "자세히" }).click();
  await expect(page.getByText("할인·쿠폰 시뮬레이션")).toBeVisible();
  await page.getByRole("radio", { name: "요약" }).click();

  // ④ 문서: 추정값이 남아 있으면 인쇄 전에 확인을 받는다
  await page.getByRole("button", { name: /^견적서$/ }).click();
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  await expect(confirm).toContainText("차량비 — 추정");
  await expect(confirm.getByRole("button", { name: "인쇄" })).toBeDisabled();
  await confirm.getByRole("button", { name: "취소" }).click();

  // 예약 관리: 지금 견적으로 예약을 만들면 판매 금액이 채워지고 목록에 보인다
  await page.getByRole("button", { name: "예약 관리" }).click();
  const bookings = page.getByRole("dialog", { name: "예약 관리" });
  await bookings.getByRole("button", { name: "지금 견적으로 예약 만들기" }).click();
  await bookings.getByLabel("고객(단체) 이름 *").fill("E2E 산악회");
  await bookings.getByRole("button", { name: "저장", exact: true }).click();
  await expect(bookings.getByRole("row", { name: /E2E 산악회/ })).toBeVisible();
  await expect(bookings.getByRole("row", { name: /E2E 산악회/ })).toContainText("견적 발송");
});

test("더보기 메뉴: 대화상자를 열면 목록은 닫히고 대화상자는 보인다", async ({ page }) => {
  await page.getByRole("button", { name: "더보기" }).click();
  await page.getByRole("button", { name: "이력·백업" }).click();
  await expect(page.getByRole("dialog", { name: "견적 이력 · 백업" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이력·백업" })).toBeHidden();
});
