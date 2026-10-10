import { expect, test, type Page } from "@playwright/test";
import { DAYS, mockAi } from "./mocks";

// 판매·운영 편의: 환율 변동 경고, 업체 견적 기록, 고객용 웹 일정표 링크, 영문 문서, 출발 시기 확인, 처음 사용 안내

const work = { days: DAYS, pmChoice: {}, meta: { packageName: "마카오 노노 3일", cities: ["마카오"], noShopping: true, noOption: true, hotelGrade: "4성급", highlights: [] }, generatedCurrency: "KRW", usps: [], uspKey: null };

const supplierQuote = {
  originalPrice: 4780,
  originalCurrency: "HKD",
  rate: 175,
  pricePerPerson: 836500,
  basisTravelers: 0,
  roomBasis: "twin",
  singleSupplement: 0,
  tiers: [],
  lines: [],
  includes: ["호텔", "차량"],
  excludes: [],
  shopping: "",
  options: "",
  notes: "",
  readAt: "2026-10-05T00:00:00.000Z",
};

async function seed(page: Page, input: Record<string, unknown>, extra: Record<string, string> = {}) {
  await page.addInitScript(
    ([w, i, x]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("semitour-planner:input:v1", JSON.stringify(i));
      localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
      for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v);
    },
    [work, input, extra] as const,
  );
}

const base = { destination: "마카오", days: 3, nights: 2, travelers: 4, departureDate: "2026-11-05", vehicleCostPerDay: 150000, guideCostPerDay: 100000, costStatus: { vehicle: "confirmed", guide: "confirmed" } };

test("환율 변동: 외화 업체 견적은 지금 환율과 견줘 알리고, 다시 계산 / 업체 견적 기록에서 지난 요금과 견준다", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/fx**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ krwPerUnit: new URL(r.request().url()).searchParams.get("code") === "HKD" ? 180 : 1 }) }));
  const rec = (id: string, at: string, price: number) => ({
    id, at, supplier: "인베스트 투어", fileName: "인베스트 투어.docx", packageName: "마카오 노노", destination: "마카오", nights: 2, days: 3, currency: "KRW",
    pricePerPerson: price * 175, priceLow: price * 175, priceHigh: price * 175, originalPrice: price, originalCurrency: "HKD", rate: 175, hotels: [], minTravelers: 0, includes: [], excludes: [], shopping: "", options: "",
  });
  await seed(page, { ...base, pricingMode: "supplier", supplierPricePerPerson: 836500, supplierQuote }, { "semitour-planner:supplierQuotes": JSON.stringify([rec("b", "2026-10-05T00:00:00Z", 4780), rec("a", "2026-09-01T00:00:00Z", 4580)]) });
  await page.goto("/");

  const insights = page.getByRole("complementary", { name: "요약 · 추천" });
  const more = insights.getByRole("button", { name: /개 더 보기/ });
  if (await more.isVisible().catch(() => false)) await more.click();
  await expect(insights.getByText("환율이 견적 받을 때보다 2.9% 올랐습니다 (HKD 175.0 → 180.0)")).toBeVisible();
  await insights.getByRole("button", { name: "지금 환율로 다시 계산" }).click();
  await expect(insights.getByText(/환율이 견적 받을 때보다/)).toHaveCount(0);

  const history = page.getByRole("region", { name: "업체 견적 기록" });
  await expect(history).toContainText("인베스트 투어 2박: 지난번 4,580 → 이번 4,780 HKD (+4.4%");
});

test("고객용 웹 일정표: 링크를 만들면 접근 코드 없이 휴대폰 화면으로 열리고, 원가는 없다", async ({ page }) => {
  await mockAi(page);
  await seed(page, { ...base, pricingMode: "target_margin", targetMarginRate: 20 });
  await page.goto("/");
  const box = page.getByRole("region", { name: "고객용 웹 일정표" });
  await box.getByRole("button", { name: "링크 만들기" }).click();
  const done = box.getByRole("status").filter({ hasText: "/t/" });
  const link = done.getByRole("link");
  await expect(link).toBeVisible();
  const url = await link.getAttribute("href");
  expect(url).toMatch(/\/t\/[A-Za-z0-9_-]{16,}$/);

  // 다시 누르면 같은 링크를 고친다
  await box.getByRole("button", { name: "링크 내용 고치기" }).click();
  await expect(box.getByRole("status").filter({ hasText: "같은 링크의 내용을 바꿨습니다" })).toBeVisible();
  await expect(link).toHaveAttribute("href", url!);

  await page.goto(url!);
  await expect(page.getByRole("heading", { name: "마카오 노노 3일" })).toBeVisible();
  await expect(page.getByText("다낭 대성당", { exact: true })).toBeVisible();
  await expect(page.getByText(/^1인 /)).toBeVisible();
  await expect(page.locator("main")).not.toContainText("원가");
  await page.goto("/t/AAAAAAAAAAAAAAAAAAAAAA");
  await expect(page.getByText("일정표를 찾을 수 없습니다")).toBeVisible();
});

test("영문 일정표·견적서: 한글 글을 번역해 영어 문서로 인쇄", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.route("**/api/translate-doc", async (r) => {
    const { texts } = r.request().postDataJSON() as { texts: string[] };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ translations: texts.map((t, i) => (t === "다낭 대성당" ? "Da Nang Cathedral" : `EN-${i}`)) }) });
  });
  await seed(page, { ...base, pricingMode: "target_margin", targetMarginRate: 20 });
  await page.goto("/");
  await page.getByRole("button", { name: "영문 일정표·견적서 (English)" }).click();
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole("checkbox").check();
    await confirm.getByRole("button", { name: "인쇄" }).click();
  }
  const doc = page.locator(".print-root");
  await expect(doc).toContainText("Itinerary & Quotation");
  await expect(doc).toContainText("Da Nang Cathedral");
  await expect(doc).toContainText("Thu, Nov 5, 2026");
  // 한글이 하나도 남지 않는다 (모두 번역 글로)
  expect(await doc.innerText()).not.toMatch(/[가-힣]/);
});

test("출발 시기 확인: 출발일이 있으면 날씨·공휴일 경고와 고객 안내 문구", async ({ page }) => {
  await mockAi(page);
  let asked: Record<string, unknown> | null = null;
  await page.route("**/api/season-check", async (r) => {
    asked = r.request().postDataJSON();
    await r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ weather: "평균 22~27도, 맑음", notes: [{ kind: "weather", severity: "warn", title: "11월 초 늦은 태풍 가능성", detail: "실내 대체 일정을 준비하세요.", dates: "11월 1~7일" }], searched: true, sources: [] }),
    });
  });
  await seed(page, { ...base, pricingMode: "target_margin", targetMarginRate: 20 });
  await page.goto("/");
  const insights = page.getByRole("complementary", { name: "요약 · 추천" });
  await expect(insights.getByText("출발 시기: 11월 초 늦은 태풍 가능성")).toBeVisible({ timeout: 15_000 });
  expect(asked).toMatchObject({ destination: "마카오", departureDate: "2026-11-05", days: 3 });
});

test("처음 사용 안내: 첫 방문에 열리고, 닫으면 다시 열리지 않으며, 더보기에서 다시 본다", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("e2e-show-welcome", "1"));
  await mockAi(page);
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "세미투어 플래너 사용 안내" });
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "시작하기" }).click();
  await expect(guide).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "자동 구성", exact: true })).toBeVisible();
  await expect(guide).toBeHidden();
  await page.getByRole("button", { name: "더보기" }).click();
  await page.getByRole("button", { name: "사용 안내" }).click();
  await expect(guide).toBeVisible();
});
