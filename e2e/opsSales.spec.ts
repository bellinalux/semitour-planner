import { expect, test, type Page } from "@playwright/test";
import { DAYS, mockAi } from "./mocks";

// 운영·판매 편의 2: 기능 검색, 출발 준비(체크·명단·정산), 고객 후기 링크, 영문 웹 링크, 시리즈 출발·할인, 견적 후속 알림, 채널 등록

const work = { days: DAYS, pmChoice: {}, meta: { packageName: "다낭 핵심 3일", cities: ["다낭"], noShopping: true, noOption: true, hotelGrade: "4성급", highlights: [] }, generatedCurrency: "KRW", usps: [], uspKey: null };
const base = { destination: "다낭", days: 3, nights: 2, travelers: 4, departureDate: "2026-11-05", vehicleCostPerDay: 150000, guideCostPerDay: 100000, pricingMode: "target_margin", targetMarginRate: 20, costStatus: { vehicle: "confirmed", guide: "confirmed" } };

async function seed(page: Page, extra: Record<string, string> = {}) {
  await page.addInitScript(
    ([w, i, x]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("semitour-planner:input:v1", JSON.stringify(i));
      localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
      for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v);
    },
    [work, base, extra] as const,
  );
}

test("기능 검색(Ctrl+K): 기능 이름으로 찾아 그 화면으로 이동하거나 창을 연다", async ({ page }) => {
  await mockAi(page);
  await seed(page);
  await page.goto("/");
  await expect(page.locator("#documents")).toBeAttached();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "기능 검색" });
  await palette.getByLabel("기능 이름으로 찾기").fill("얼리버드");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page.locator("#series-prices")).toBeInViewport();

  await page.getByRole("button", { name: "검색 Ctrl+K" }).click();
  await palette.getByLabel("기능 이름으로 찾기").fill("근교");
  await palette.getByRole("option").first().click();
  await expect(page.getByRole("dialog", { name: "근교 투어 만들기 (반일·당일)" })).toBeVisible();
});

test("출발 준비: 예약 확인 체크·명단 객실 배정·행사 후 실제 손익 (상품별로 저장)", async ({ page }) => {
  await mockAi(page);
  await seed(page);
  await page.goto("/");
  const ops = page.locator("#ops-panel");
  await ops.getByRole("button", { name: /출발 준비 · 명단 · 정산/ }).click();
  const first = ops.getByRole("checkbox").first();
  await first.check();
  await expect(ops.getByRole("tab", { name: /예약 확인 1\// })).toBeVisible();

  await ops.getByRole("tab", { name: /명단·룸리스트/ }).click();
  for (const [name, g] of [["KIM MINJI", "F"], ["LEE SUA", "F"], ["PARK JUN", "M"]] as const) {
    await ops.getByRole("button", { name: "참가자 추가" }).click();
    const n = await ops.getByLabel(/번 이름$/).count();
    await ops.getByLabel(`${n}번 이름`).fill(name);
    await ops.getByLabel(`${n}번 성별`).selectOption(g);
  }
  await ops.getByRole("button", { name: /객실 자동 배정/ }).click();
  await expect(ops.getByText("객실 2개")).toBeVisible();

  await ops.getByRole("tab", { name: "행사 후 정산" }).click();
  await ops.getByLabel("차량비 실제 지출").fill("500000");
  await expect(ops.getByRole("group", { name: "실제 손익" })).toContainText("견적 이익");

  // 다시 열어도 남아 있다
  await page.reload();
  await ops.getByRole("button", { name: /출발 준비 · 명단 · 정산/ }).click();
  await expect(ops.getByRole("tab", { name: /예약 확인 1\// })).toBeVisible();
  await expect(ops.getByRole("tab", { name: /명단·룸리스트 3명/ })).toBeVisible();
});

test("고객 후기: 예약에서 후기 링크를 만들고, 고객이 남긴 별점·한마디가 예약에 보인다", async ({ page }) => {
  await mockAi(page);
  await seed(page);
  await page.goto("/");
  await page.getByRole("button", { name: "예약 관리" }).click();
  const dlg = page.getByRole("dialog", { name: "예약 관리" });
  await dlg.getByRole("button", { name: "지금 견적으로 예약 만들기" }).click();
  await dlg.getByLabel("고객(단체) 이름 *").fill("E2E 산악회");
  await dlg.getByRole("button", { name: "후기 링크 만들기" }).click();
  const memo = dlg.getByLabel("메모 (항공 발권, 객실 배정, 특이사항 등)");
  await expect(memo).toHaveValue(/후기 링크: http.*\/r\//);
  const url = /(http\S+\/r\/[A-Za-z0-9_-]+)/.exec(await memo.inputValue())![1];
  await dlg.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dlg.getByRole("row", { name: /E2E 산악회/ })).toBeVisible();

  // 고객이 링크를 열어 별점을 남긴다 (접근 코드 없이)
  await page.goto(url);
  await page.getByRole("radiogroup", { name: "전체 만족도" }).getByRole("radio", { name: "5점" }).click();
  await page.getByRole("radiogroup", { name: "가이드·기사" }).getByRole("radio", { name: "4점" }).click();
  await page.getByLabel("좋았던 점·아쉬웠던 점 (선택)").fill("가이드가 친절했어요");
  await page.getByRole("button", { name: "후기 보내기" }).click();
  await expect(page.getByText("소중한 의견 감사합니다!")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "예약 관리" }).click();
  await dlg.getByRole("row", { name: /E2E 산악회/ }).first().click();
  await expect(dlg.getByText("★ 5")).toBeVisible();
  await expect(dlg.getByText(/가이드가 친절했어요/)).toBeVisible();
});

test("영문 웹 일정표 링크 · 시리즈 출발 할인 · 채널 등록 내보내기", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/translate-doc", async (r) => {
    const { texts } = r.request().postDataJSON() as { texts: string[] };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ translations: texts.map((t) => (t === "다낭 대성당" ? "Da Nang Cathedral" : `EN ${t.length}`)) }) });
  });
  await seed(page);
  await page.goto("/");

  // 시리즈 출발: 할인 규칙을 넣으면 회차표에 조기 예약가가 생긴다
  const series = page.locator("#series-prices");
  await series.getByRole("button", { name: "할인 규칙 추가" }).click();
  await expect(series.getByRole("columnheader", { name: "조기 5%" })).toBeVisible();
  await expect(series.getByRole("row").nth(1)).toContainText("2026-11-05 (목)");

  // 채널 등록용 내보내기 버튼
  await expect(page.getByRole("button", { name: "상품 정보 복사 (항목별)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CSV 받기" })).toBeVisible();

  // 영문 링크
  const box = page.getByRole("region", { name: "고객용 웹 일정표" });
  await box.getByLabel("웹 일정표 언어").selectOption("en");
  await box.getByRole("button", { name: "영문 링크 만들기" }).click();
  const link = box.getByRole("status").filter({ hasText: "/t/" }).getByRole("link");
  await expect(link).toBeVisible();
  await page.goto((await link.getAttribute("href"))!);
  await expect(page.getByText("Da Nang Cathedral")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Day 1/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Call us" }).or(page.getByText("Last updated"))).toBeVisible();
});

test("여행일정표: 업계 표 형식(일자·지역·교통편·시간·일정·식사)과 조건 표식·쇼핑·선택관광·가이드 경비·여행 정보", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  let asked = false;
  await page.route("**/api/travel-info", async (r) => {
    asked = true;
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ timeDifference: "한국보다 2시간 느림", voltage: "220V, A·C타입", currency: "동(VND)", visa: "45일 무비자", emergency: "경찰 113", embassy: "주다낭 총영사관", weather: "우기, 우산 필요", searched: true }) });
  });
  await seed(page);
  await page.goto("/");
  await page.getByRole("button", { name: "여행일정표" }).click();
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole("checkbox").check();
    await confirm.getByRole("button", { name: "인쇄" }).click();
  }
  const doc = page.locator(".print-root");
  await expect(doc).toContainText("일자별 일정");
  // 인쇄 영역은 화면 읽기에서 숨겨져(aria-hidden) 있어 태그로 확인한다
  await expect(doc.locator("th")).toContainText(["일자", "지역", "교통편", "시간", "일정", "식사"]);
  await expect(doc).toContainText("제1일");
  // 둘째 날: 호텔 미팅 → 이동 → 첫 장소 (미팅 시각과 첫 장소 시각이 다르다)
  await expect(doc).toContainText("호텔 로비 미팅 후 출발");
  await expect(doc.locator('ul[aria-label="상품 조건"]')).toContainText("노쇼핑");
  await expect(doc).toContainText("노옵션 — 선택관광이 없습니다.");
  await expect(doc).toContainText("노쇼핑 — 일정에 쇼핑센터 방문이 없습니다.");
  await expect(doc).toContainText("가이드 · 기사 경비");
  await expect(doc).toContainText("한국보다 2시간 느림");
  await expect(doc).toContainText("상기 일정은 항공 및 현지 사정");
  expect(asked).toBe(true);
});
