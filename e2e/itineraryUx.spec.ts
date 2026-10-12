import { expect, test, type Page } from "@playwright/test";
import { DAYS, mockAi } from "./mocks";

// 일정표 보기·고치기 편의 — 간단히/자세히, 제목 바로 고치기, 날짜 바로가기, 사이에 넣기, 이동 시간 고치기, 여러 항목 한꺼번에, 금액 쉼표·체류 ±10분

const work = { days: DAYS, pmChoice: {}, meta: { packageName: "다낭 3일", cities: ["다낭"], noShopping: true, noOption: true, hotelGrade: "4성급", highlights: [] }, generatedCurrency: "KRW", usps: [], uspKey: null };
const input = { destination: "다낭", days: 3, nights: 2, travelers: 4, departureDate: "2026-11-05", vehicleCostPerDay: 150000, guideCostPerDay: 100000, pricingMode: "target_margin", targetMarginRate: 20, tripScope: "overseas" };

async function setup(page: Page) {
  await mockAi(page);
  await page.addInitScript(
    ([w, i]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("semitour-planner:input:v1", JSON.stringify(i));
      localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
    },
    [work, input] as const,
  );
  await page.goto("/");
}

test("간단히 보기: 항목은 한 줄 요약, 누르면 그 항목만 펼치고, 자세히로 바꾸면 모두 펼친다", async ({ page }) => {
  await setup(page);
  const day1 = page.locator("#day-1");
  // 간단히(기본): 체류·금액 입력칸 없이 한 줄
  await expect(day1.getByRole("button", { name: "한 시장", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(day1.getByRole("spinbutton", { name: "체류 시간(분)" })).toHaveCount(0);
  await expect(day1.getByText("식대 ₩15,000")).toBeVisible();
  // 한 항목만 펼치기
  await day1.getByRole("button", { name: "마담 란", exact: true }).click();
  await expect(day1.getByRole("textbox", { name: "식대" })).toHaveValue("15,000");
  await expect(day1.getByRole("spinbutton", { name: "체류 시간(분)" })).toHaveCount(1);
  // 체류 ±10분
  await day1.getByRole("button", { name: "체류 10분 늘리기" }).click();
  await expect(day1.getByRole("spinbutton", { name: "체류 시간(분)" })).toHaveValue("70");
  await page.getByRole("radiogroup", { name: "항목 보기" }).getByRole("radio", { name: "자세히" }).click();
  // 자세히: 모두 펼침 (식사 앞에 자동으로 넣은 자유시간까지 4줄)
  await expect(day1.getByRole("spinbutton", { name: "체류 시간(분)" })).toHaveCount(4);
});

test("날짜 머리: 날짜·하루 요약을 보이고, 제목을 눌러 바로 고친다", async ({ page }) => {
  await setup(page);
  const day2 = page.locator("#day-2");
  await expect(day2.locator("header")).toContainText("11/6(금)");
  await expect(day2.locator("header")).toContainText("장소 2곳");
  await day2.getByRole("button", { name: /DAY 2 다낭 핵심/ }).click();
  const title = day2.getByRole("textbox", { name: "DAY 2 제목" });
  await title.fill("바나힐 하루");
  await title.press("Enter");
  await expect(day2.getByRole("heading", { name: /바나힐 하루/ })).toBeVisible();
});

test("날짜 바로가기: 날마다 상태와 날짜를 보이고 누르면 그날로 간다", async ({ page }) => {
  await setup(page);
  const bar = page.getByRole("navigation", { name: "날짜 바로가기" });
  await expect(bar.getByRole("button")).toHaveCount(3);
  await expect(bar.getByRole("button", { name: /DAY 3/ })).toContainText("11/7");
  await bar.getByRole("button", { name: /DAY 3/ }).click();
  await expect(page.locator("#day-3")).toBeInViewport();
});

test("사이에 넣기 · 이동 시간 고치기", async ({ page }) => {
  await setup(page);
  const day1 = page.locator("#day-1");
  await day1.getByRole("button", { name: "다낭 대성당 다음에 항목 넣기" }).click();
  await day1.getByRole("textbox", { name: "넣을 항목 이름" }).fill("콩 카페");
  await day1.getByRole("combobox", { name: "넣을 항목 유형" }).selectOption("meal");
  await day1.getByRole("button", { name: "넣기", exact: true }).click();
  const names = await day1.locator("h4").allInnerTexts();
  expect(names.findIndex((n) => n.includes("콩 카페"))).toBe(names.findIndex((n) => n.includes("다낭 대성당")) + 1);

  // 이동 줄을 눌러 그 자리에서 고친다
  await day1.getByRole("button", { name: "다음 장소까지 이동 10분" }).click();
  const travel = day1.getByRole("spinbutton", { name: "다낭 대성당 다음 장소까지 이동 시간(분)" });
  await travel.fill("25");
  await travel.press("Enter");
  await expect(day1.getByRole("button", { name: "다음 장소까지 이동 25분" })).toBeVisible();
});

test("여러 항목 한꺼번에: 편집에서 골라 현지 지불·체류 시간을 한 번에 바꾼다", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "일정 편집" }).click();
  const day1 = page.locator("#day-1");
  await day1.getByRole("checkbox", { name: "다낭 대성당 고르기" }).check();
  await day1.getByRole("checkbox", { name: "한 시장 고르기" }).check();
  const bar = page.getByRole("region", { name: "고른 항목 한꺼번에 바꾸기" });
  await expect(bar).toContainText("2개 고름");
  await bar.getByRole("spinbutton", { name: "고른 항목 체류 시간(분)" }).fill("50");
  await bar.getByRole("button", { name: "적용" }).click();
  await bar.getByRole("button", { name: "현지 지불(불포함)" }).click();
  await page.getByRole("button", { name: "편집 완료" }).click();
  await expect(bar).toHaveCount(0);
  await expect(day1.getByText("현지 지불")).toHaveCount(2);
  await expect(day1.getByText("50분", { exact: true })).toHaveCount(2);
});
