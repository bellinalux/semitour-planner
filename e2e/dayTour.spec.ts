import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

// 근교 투어 만들기 — 조건을 넣고 만들면 코스(차량·도보 구간)·원가·판매가·인원별 가격표가 나오고, 구간 수단을 바꾸면 원가가 다시 계산된다
const stop = (name: string, patch: Record<string, unknown> = {}) => ({ name, area: "가평", kind: "sight", lat: 0, lng: 0, stayMinutes: 90, entryFee: 0, parkingFee: 0, note: "", ...patch });
const leg = (patch: Record<string, unknown> = {}) => ({ mode: "vehicle", km: 60, minutes: 80, route: "경춘고속도로", transitFare: 0, toll: 4000, basis: "searched", ...patch });

const RESPONSE = {
  title: "가평 남이섬·쁘띠프랑스 당일 투어",
  summary: "남이섬 산책과 쁘띠프랑스를 하루에 돕니다.",
  baseLat: 0,
  baseLng: 0,
  stops: [stop("남이섬", { entryFee: 16000, stayMinutes: 150, parkingFee: 6000 }), stop("닭갈비 점심", { kind: "meal", entryFee: 15000, stayMinutes: 60 }), stop("쁘띠프랑스", { entryFee: 12000 })],
  legs: [leg(), leg({ km: 1, minutes: 12, mode: "walk", toll: 0, route: "도보" }), leg({ km: 10, minutes: 20, toll: 0 }), leg({ km: 65, minutes: 90 })],
  deadheadKm: 0,
  fuelPrice: 1600,
  fuelNote: "오피넷 전국 평균 경유",
  transitBaseFare: 1500,
  driverDayRate: 0,
  guideDayRate: 0,
  guideHalfDayRate: 0,
  charterDayRate: 550000,
  charterHalfDayRate: 0,
  charterIncludes: "유류비·기사 포함, 통행료·주차비 별도",
  rateNote: "",
  market: [{ name: "남이섬 쁘띠프랑스 버스투어", operator: "A투어", sourceName: "Klook", priceLow: 69000, priceHigh: 79000, durationMinutes: 600, transport: "버스", includes: "입장료" }],
  searched: true,
  routes: { source: "estimate", note: "길찾기 키가 없습니다" },
  sources: [],
};

test("근교 투어: 만들기 → 원가·판매가 → 구간 수단 바꾸기 → 저장 → 운영표 인쇄·고객 링크", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/day-tour", async (r) => {
    body = r.request().postDataJSON();
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESPONSE) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "근교 투어" }).click();
  const dialog = page.getByRole("dialog", { name: "근교 투어 만들기 (반일·당일)" });
  await dialog.getByLabel("출발·복귀 기준지 (호텔·역·도시)").fill("서울 명동");
  await dialog.getByLabel("가고 싶은 지역 (비우면 자동)").fill("가평");
  await dialog.getByLabel("인원", { exact: true }).fill("15");
  await dialog.getByLabel("통화").selectOption("KRW");
  await dialog.getByLabel("국내·해외").selectOption("domestic");
  await dialog.getByRole("button", { name: "코스·원가 만들기" }).click();

  await expect(dialog.getByLabel("투어 상품명")).toHaveValue("가평 남이섬·쁘띠프랑스 당일 투어");
  expect(body).toMatchObject({ base: "서울 명동", area: "가평", travelers: 15, transport: "vehicle", vehicleClass: "중형버스 (25~29인승)" });

  const costs = dialog.getByRole("region", { name: "원가", exact: true });
  await expect(costs).toContainText("유류비");
  await expect(costs).toContainText("통행료");
  await expect(costs).toContainText("기사 인건비");
  // 차량 구간 135km ÷ 5km/L × 1,600 = 43,200 (도보 1km는 빼고)
  await expect(costs).toContainText("43,200");
  await expect(dialog.getByRole("region", { name: "인원별 가격표" }).getByText("차종·가이드 바뀜").first()).toBeVisible();
  await expect(dialog.getByRole("region", { name: "비슷한 판매 투어" })).toContainText("남이섬 쁘띠프랑스 버스투어");

  // 쁘띠프랑스 → 서울 구간을 대중교통으로 바꾸면 1인 대중교통 요금이 원가에 들어간다
  await dialog.getByLabel("구간 4 이동 수단").selectOption("transit");
  await expect(costs).toContainText("대중교통 요금");

  // 대절 시세형으로 바꾸면 대절 요금으로
  await dialog.getByRole("radio", { name: "대절 시세형" }).click();
  await expect(costs).toContainText("차량 대절");

  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog.getByText("저장한 근교 투어 (1)")).toBeVisible();

  // 운영표 인쇄 (가격 없음)
  await dialog.getByRole("button", { name: "운영표 인쇄" }).click();
  const doc = page.locator(".print-root").filter({ hasText: "근교 투어 운영표" });
  await expect(doc).toContainText("남이섬");
  await expect(doc).not.toContainText("원가");

  // 고객용 웹 링크
  await dialog.getByRole("button", { name: "고객용 웹 링크" }).click();
  const link = dialog.getByRole("status").filter({ hasText: "/t/" }).getByRole("link");
  await expect(link).toBeVisible();
  await page.goto((await link.getAttribute("href"))!);
  await expect(page.getByRole("heading", { name: "가평 남이섬·쁘띠프랑스 당일 투어" })).toBeVisible();
  await expect(page.getByText("쁘띠프랑스", { exact: true })).toBeVisible();
});

test("근교 투어: 도보 투어는 차량·차고지 칸이 없다", async ({ page }) => {
  await mockAi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "근교 투어" }).click();
  const dialog = page.getByRole("dialog", { name: "근교 투어 만들기 (반일·당일)" });
  await expect(dialog.getByLabel("차고지 (선택 — 공차 거리 계산)")).toBeVisible();
  await dialog.getByRole("radio", { name: "도보", exact: true }).click();
  await expect(dialog.getByLabel("차고지 (선택 — 공차 거리 계산)")).toHaveCount(0);
});

test("근교 투어 합류형: 요일로 출발일을 만들고, 좌석을 넣으면 출발 확정·마감이 보이며 저장하면 남는다", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/day-tour", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESPONSE) }));
  await page.goto("/");
  await page.getByRole("button", { name: "근교 투어" }).click();
  const dialog = page.getByRole("dialog", { name: "근교 투어 만들기 (반일·당일)" });
  await dialog.getByLabel("출발·복귀 기준지 (호텔·역·도시)").fill("서울 명동");
  await dialog.getByLabel("인원", { exact: true }).fill("10");
  await dialog.getByLabel("통화").selectOption("KRW");
  await dialog.getByLabel("국내·해외").selectOption("domestic");
  await dialog.getByRole("button", { name: "코스·원가 만들기" }).click();

  const dep = dialog.getByRole("region", { name: "정기 출발 (합류형)" });
  await dep.getByLabel("첫 출발일").fill("2030-01-05");
  await dep.getByLabel("기간").selectOption("2");
  // 토요일은 기본 선택, 일요일도 더한다
  await dep.getByRole("button", { name: "일요일" }).click();
  await dep.getByRole("button", { name: "출발일 추가" }).click();
  await expect(dep.getByRole("row")).toHaveCount(5);
  await dep.getByLabel("최소 출발").fill("6");
  await dep.getByLabel("정원").fill("12");
  await dep.getByLabel("2030-01-05 판매 좌석").fill("7");
  await dep.getByLabel("2030-01-06 판매 좌석").fill("12");
  await expect(dep.getByRole("row").filter({ hasText: "2030-01-05" })).toContainText("출발 확정");
  await expect(dep.getByRole("row").filter({ hasText: "2030-01-06" })).toContainText("마감");
  await expect(dep.getByRole("row").filter({ hasText: "2030-01-12" })).toContainText("모집 중");

  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  const saved = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.includes("dayTour") || k.includes("day-tour"))?.[1] ?? "");
  expect(saved).toContain('"date":"2030-01-05","sold":7');
});
