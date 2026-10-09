import { expect, test, type Page } from "@playwright/test";
import { DAYS, mockAi, mockBuild } from "./mocks";

const seed = (page: Page, input: Record<string, unknown>) =>
  page.addInitScript((value) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify(value));
  }, input);

test("가격 모름 · 자동 견적: 코스·숙소·시세를 채워 권장 판매가까지", async ({ page }) => {
  await mockAi(page);
  await mockBuild(page);
  await seed(page, { destination: "다낭", days: 3, nights: 2, travelers: 4, packageType: "land_hotel", pricingMode: "target_margin", targetMarginRate: 15 });
  await page.goto("/");

  await page.getByRole("button", { name: "자동 구성", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "자동 구성 끝" })).toBeVisible({ timeout: 30_000 });
  const costTable = page.locator("table", { has: page.locator("caption", { hasText: "원가 내역" }) });
  await expect(costTable.getByText(/출처: 고른 숙소/)).toBeVisible();
  await expect(page.getByText("권장 판매가").first()).toBeVisible();
});

test("업체 견적서: 요금을 읽어 공급가로 넣고, 목표 판매가에서 공급가 상한을 계산", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/fx**", (r) => {
    const code = new URL(r.request().url()).searchParams.get("code");
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ krwPerUnit: code === "USD" ? 1400 : 1 }) });
  });
  await page.route("**/api/parse-course", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        days: DAYS,
        nights: 2,
        totalDays: 3,
        meta: { packageName: "다낭 바나힐 3일", cities: ["다낭"], noShopping: true, noOption: false, hotelGrade: "4성급", highlights: [] },
        quote: {
          currency: "USD",
          pricePerPerson: 400,
          basisTravelers: 4,
          roomBasis: "twin",
          singleSupplement: 120,
          tiers: [
            { travelers: 2, pricePerPerson: 520 },
            { travelers: 4, pricePerPerson: 400 },
          ],
          lines: [],
          includes: ["호텔", "차량", "가이드"],
          excludes: ["가이드 팁"],
          shopping: "노쇼핑",
          options: "",
          notes: "",
        },
      }),
    }),
  );
  await seed(page, {
    mode: "paste",
    courseText: "DAY 1 다낭 도착 바나힐 DAY 2 호이안 DAY 3 귀국 · 1인 USD 400 (4명 기준, 2인 1실)",
    travelers: 4,
    pricingMode: "fixed_price",
    fixedPricePerPerson: 700000,
    targetMarginRate: 15,
    cardFeeRate: 0,
  });
  await page.goto("/");

  await page.getByRole("button", { name: "코스 분석" }).click();
  await expect(page.getByText("업체 견적 검증 · 목표 원가")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("400 USD", { exact: true })).toBeVisible();
  await expect(page.getByText(/≈ ₩560,000/)).toBeVisible();
  // 목표 700,000 − 회사 수익 105,000 = 상한 595,000 → 지금 공급가 560,000은 상한 안
  const calc = page.getByLabel("업체 공급가 상한 계산");
  await expect(calc.getByText("₩595,000")).toBeVisible();
  await expect(page.getByText(/상한 안입니다/)).toBeVisible();

  // 검증표: 우리 시세와 비교하고, 견적서에 안 적힌 것·불포함 팁을 업체에 물어볼 질문으로
  await expect(page.locator("table", { has: page.locator("caption", { hasText: "업체 견적 시세 비교" }) })).toBeVisible();
  await expect(page.locator("#supplier-check").getByText(/업체에 물어볼 것/)).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "가이드·기사 팁(경비)은 1인 얼마이고, 고객이 현지에서 내는 건가요?" })).toBeVisible();

  // 우리 시세를 조회하면 1인 공급가 전체를 시세 원가와 비교한다
  await page.getByRole("button", { name: "시세 조회" }).click();
  const verifyTable = page.locator("table", { has: page.locator("caption", { hasText: "업체 견적 시세 비교" }) });
  await expect(verifyTable.getByRole("row", { name: /1인 공급가 전체/ })).not.toContainText("모름", { timeout: 30_000 });
  await expect(page.locator("#supplier-check").getByText(/업체 몫 추정|우리 시세 원가가 공급가보다/)).toBeVisible();

  // 수익선 두 줄과, 시세 조회 때 찾은 경쟁 상품별 공급가 기준
  await expect(page.getByText("손익분기 공급가 (회사 수익 0)")).toBeVisible();
  const caps = page.locator("table", { has: page.locator("caption", { hasText: "경쟁 상품별 공급가 기준" }) });
  await expect(caps.getByRole("row", { name: /하나투어/ })).toBeVisible({ timeout: 30_000 });

  // 업체 수정 요청서: 질문을 묶은 문구와 검증표 엑셀
  await expect(page.getByLabel("업체 수정 요청 문구")).toHaveValue(/■ 확인 부탁드립니다/);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "검증표 엑셀" }).click()]);
  expect(download.suggestedFilename()).toContain("업체견적검증");
});

test("업체 코스표: 출발 요일별 요금을 골라 넣고, 금액 있는 불포함 일정은 옵션으로, 견적서 호텔 이름으로 숙박 시세", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/fx**", (r) => {
    const code = new URL(r.request().url()).searchParams.get("code");
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ krwPerUnit: code === "USD" ? 1400 : code === "HKD" ? 180 : 1 }) });
  });
  const hotelNames = ["골든드래곤 호텔", "리젠시 아트 호텔"];
  await page.route("**/api/search-lodging-price", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        searched: true,
        sources: [],
        estimate: {
          rateLow: 90000,
          rateHigh: 150000,
          basis: "searched",
          cityTaxPerPersonPerNight: 0,
          areaNote: "",
          sourceName: "Agoda",
          priceNote: "",
          searchUrl: "",
          checkedAt: "",
          hotels: [
            { name: hotelNames[0], rateLow: 90000, rateHigh: 110000, found: true, sourceName: "Agoda" },
            { name: hotelNames[1], rateLow: 130000, rateHigh: 150000, found: true, sourceName: "Booking.com" },
          ],
        },
      }),
    }),
  );
  await page.route("**/api/parse-course", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        days: DAYS,
        nights: 3,
        totalDays: 4,
        meta: { packageName: "오롯이 마카오", cities: ["마카오"], noShopping: false, noOption: false, hotelGrade: "4·5성", highlights: [] },
        quote: {
          currency: "HKD",
          pricePerPerson: 4780,
          basisTravelers: 0,
          minTravelers: 4,
          hotels: "골든드래곤 호텔(4성), 리젠시 아트 호텔(5성) 중 하나",
          roomBasis: "twin",
          singleSupplement: 0,
          tiers: [],
          datePrices: [
            { nights: 3, weekdays: [0, 1, 2], label: "일, 월, 화", pricePerPerson: 4780 },
            { nights: 3, weekdays: [4, 5], label: "목, 금", pricePerPerson: 5080 },
          ],
          hotelNames,
          optionPrices: [{ name: "홍콩 데이투어", amount: 180, currency: "USD", perGroup: false, minTravelers: 8 }],
          lines: [],
          includes: ["차량", "가이드", "단체 식사"],
          excludes: ["홍콩 데이투어 (최소 8인, 인당 180USD)"],
          shopping: "",
          options: "",
          notes: "",
          suspectPrice: 0,
        },
      }),
    }),
  );
  await seed(page, {
    mode: "paste",
    courseText: "1일차 마카오 도착 … 3박 4일 일·월·화 4780 HKD",
    destination: "마카오",
    travelers: 4,
    nights: 3,
    days: 4,
    departureDate: "2026-11-05",
    pricingMode: "fixed_price",
    fixedPricePerPerson: 1200000,
    targetMarginRate: 15,
    cardFeeRate: 0,
  });
  await page.goto("/");

  await page.getByRole("button", { name: "코스 분석" }).click();
  const check = page.locator("#supplier-check");
  await expect(check.getByText("출발 요일별 1인 요금")).toBeVisible({ timeout: 30_000 });
  // 2026-11-05는 목요일 → 목·금 요금 5,080 HKD × 180 = 914,400
  await expect(check.getByText(/3박 목, 금 출발 요금을 넣었습니다/)).toBeVisible();
  await expect(check.getByText(/선택 옵션에 등록했습니다/)).toBeVisible();

  await check.getByRole("button", { name: "시세 조회" }).click();
  await expect(check.getByText("후보 호텔 1박 시세 (2인 1실, 웹 공개 요금)")).toBeVisible({ timeout: 30_000 });
  await expect(check.getByText(/견적서 호텔 2곳의 웹 공개 요금 평균/)).toBeVisible({ timeout: 30_000 });
});
