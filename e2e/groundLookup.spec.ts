import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

const tiers = {
  car: { low: 60, mid: 70, high: 80, source: "web", basis: "웹 시세" },
  suv: { low: 80, mid: 90, high: 100, source: "web", basis: "웹 시세" },
  van: { low: 110, mid: 130, high: 150, source: "web", basis: "웹 시세" },
  midbus: { low: 180, mid: 200, high: 230, source: "book-supplier", basis: "회사 요금표 — 29인승 · 2주 전 ○○랜드사 견적가" },
  bus: { low: 250, mid: 280, high: 320, source: "web", basis: "웹 시세" },
};

test("전세버스·가이드 조회: 인원으로 차종·대수를 정하고, 고른 기준으로 견적에 적용", async ({ page }) => {
  await mockAi(page);
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/ground-lookup", async (r) => {
    sent = r.request().postDataJSON() as Record<string, unknown>;
    await r.fulfill({
      json: {
        travelers: 50,
        plan: { tier: "midbus", tierLabel: "중형버스 (25~29인승)", count: 2, guides: 2, label: "중형버스 (25~29인승) 2대 · 가이드 2명" },
        tiers,
        guide: { low: 70, mid: 80, high: 100, source: "web", basis: "웹 시세", label: "한국어 가이드" },
        vehicleConditions: "10시간·유류비·기사 포함",
        guideConditions: "한국어 가이드 8시간",
        searched: true,
        usedWeb: true,
        sources: [{ title: "다낭 버스 렌트", url: "https://x.example" }],
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("여행지").fill("다낭");
  await page.locator("#travelers").fill("50");
  await page.getByRole("button", { name: /원가 직접 입력/ }).click();
  await page.getByRole("button", { name: /고정비용/ }).click();

  const panel = page.getByRole("region", { name: "전세버스·가이드 조회" });
  await expect(panel).toContainText("50명 → 중형버스 (25~29인승) 2대 · 가이드 2명");
  await panel.getByRole("button", { name: "전세버스·가이드 조회" }).click();
  await expect(panel.getByRole("table")).toContainText("요금표·업체 견적가");
  expect(sent).toMatchObject({ destination: "다낭", travelers: 50 });

  // 보통: 200 × 2대, 80 × 2명 / 높음으로 바꾸면 230 × 2, 100 × 2 (중형버스는 회사 요금표 값)
  await expect(panel).toContainText("400");
  await panel.getByRole("radio", { name: "높음" }).check();
  await panel.getByRole("button", { name: "견적에 적용" }).click();
  await expect(panel.getByRole("status")).toContainText("견적에 적용했습니다");
  await expect(page.locator("#vehicleCostPerDay")).toHaveValue(/460/);
  await expect(page.locator("#guideCostPerDay")).toHaveValue(/200/);
});
