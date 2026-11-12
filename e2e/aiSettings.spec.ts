import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

test("더보기 → AI 키 설정: 업체별 상태와 연결 시험", async ({ page }) => {
  await mockAi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "더보기" }).click();
  await page.getByRole("button", { name: "AI 키 설정" }).click();
  const dialog = page.getByRole("dialog", { name: "AI 키 설정" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Gemini" })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Groq" })).toBeVisible();
  await expect(dialog.getByLabel("Gemini 모델")).toHaveValue("gemini-flash-lite-latest");
  await expect(dialog.getByLabel("AI 사용 순서")).toHaveValue("gemini,groq,cloudflare");
  // 로컬(접속 코드 없음)에서는 앱에 저장할 수 없다고 알린다
  await expect(dialog.getByText("앱에서 키를 저장할 수 없습니다")).toBeVisible();
  // Cloudflare AI는 로컬에 연결이 없다 — 연결 시험 결과가 그렇게 나온다
  const cf = dialog.getByRole("region", { name: "Cloudflare AI" });
  await cf.getByRole("button", { name: "연결 시험" }).click();
  await expect(cf.getByRole("status")).toContainText("Cloudflare AI 실패");
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();
});
