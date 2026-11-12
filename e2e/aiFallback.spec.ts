import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

test("대체 AI가 답하면 화면 오른쪽 아래에 안내가 뜬다", async ({ page }) => {
  await mockAi(page);
  // 나중에 건 route가 먼저 처리된다 — 원래 가짜 응답에 대체 AI 머리글(서버 withAiInfo와 같은 형식)만 덧붙인다
  await page.route("**/api/generate-itinerary", async (r) => {
    const original = await r.fetch();
    await r.fulfill({
      response: original,
      headers: { ...original.headers(), "x-ai-provider": "groq", "x-ai-fallback": encodeURIComponent("Gemini: Gemini 선불 크레딧이 소진되었습니다.") },
    });
  });
  await page.goto("/");
  await page.getByLabel("여행지").fill("다낭");
  await page.getByRole("button", { name: "코스만" }).click();
  const notice = page.getByRole("status").filter({ hasText: "대체 AI(Groq)가 답했습니다" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("크레딧이 소진");
  await notice.getByRole("button", { name: "닫기" }).click();
  await expect(notice).toBeHidden();
});
