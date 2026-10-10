import { expect, test, type Page } from "@playwright/test";
import { DAYS, mockAi } from "./mocks";

// 고객·운영 묶음: 출발 전 안내문·준비물, 견적 버전 비교, 일본어 문서, 가이드 링크·현장 기록, 웹 견적 요청, 표지

const work = { days: DAYS, pmChoice: {}, meta: { packageName: "다낭 핵심 3일", cities: ["다낭"], noShopping: true, noOption: true, hotelGrade: "4성급", highlights: [] }, generatedCurrency: "KRW", usps: [], uspKey: null };
const base = { destination: "다낭", days: 3, nights: 2, travelers: 4, departureDate: "2026-11-05", vehicleCostPerDay: 150000, guideCostPerDay: 100000, pricingMode: "target_margin", targetMarginRate: 20, tripScope: "overseas", costStatus: { vehicle: "confirmed", guide: "confirmed" } };

async function seed(page: Page, input: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([w, i]) => {
      window.print = () => undefined;
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("semitour-planner:input:v1", JSON.stringify(i));
      localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
    },
    [work, { ...base, ...input }] as const,
  );
}

async function passPrintCheck(page: Page) {
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole("checkbox").check();
    await confirm.getByRole("button", { name: "인쇄" }).click();
  }
}

test("출발 전 안내문·준비물: 여행 정보를 넣어 복사하고, 준비물 체크리스트를 인쇄한다", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockAi(page);
  await page.route("**/api/travel-info", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ timeDifference: "한국보다 2시간 느림", voltage: "220V A·C타입", currency: "베트남 동(VND)", visa: "45일 무비자", emergency: "", embassy: "", weather: "낮 30도 안팎", searched: true }) }),
  );
  await seed(page, { customerName: "김철수" });
  await page.goto("/");
  const box = page.getByRole("region", { name: "고객 안내" });
  await box.getByRole("button", { name: "출발 전 안내문 복사" }).click();
  await expect(box.getByRole("status")).toContainText("출발 전 안내문을 복사했습니다");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("김철수님");
  expect(text).toContain("시차: 한국보다 2시간 느림");
  expect(text).toContain("멀티 어댑터");

  await box.getByRole("button", { name: "준비물 체크리스트 인쇄" }).click();
  await passPrintCheck(page);
  const doc = page.locator(".print-root");
  await expect(doc).toContainText("준비물 체크리스트");
  await expect(doc).toContainText("여권");
});

test("견적 버전: 견적서를 인쇄하면 버전이 남고, 인원을 바꿔 다시 인쇄하면 차이가 보인다", async ({ page }) => {
  await mockAi(page);
  await seed(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^견적서/ }).first().click();
  await passPrintCheck(page);
  await expect(page.locator(".print-root")).toContainText("견적");
  await page.keyboard.press("Escape");

  await page.evaluate(() => {
    const i = JSON.parse(localStorage.getItem("semitour-planner:input:v1") ?? "{}");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ ...i, travelers: 6 }));
  });
  await page.reload();
  await page.getByRole("button", { name: /^견적서/ }).first().click();
  await passPrintCheck(page);

  const panel = page.locator("#quote-versions");
  await panel.getByRole("button", { name: /견적 버전 비교/ }).click();
  await expect(panel.getByRole("list", { name: "바뀐 점" })).toContainText("인원: 4명 → 6명");
  await expect(panel.getByRole("button", { name: "고객용 변경 안내 복사" })).toBeEnabled();
});

test("일본어 일정표: 번역한 글로 일본어 문서를 만든다", async ({ page }) => {
  await mockAi(page);
  let lang = "";
  await page.route("**/api/translate-doc", async (r) => {
    const body = r.request().postDataJSON() as { texts: string[]; lang?: string };
    lang = body.lang ?? "";
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ translations: body.texts.map((t, i) => (t === "다낭 대성당" ? "ダナン大聖堂" : `JA-${i}`)) }) });
  });
  await seed(page);
  await page.goto("/");
  await page.getByRole("button", { name: "일본어 일정표·견적서 (日本語)" }).click();
  await passPrintCheck(page);
  const doc = page.locator(".print-root");
  await expect(doc).toContainText("旅行日程表・お見積り");
  await expect(doc).toContainText("ダナン大聖堂");
  expect(lang).toBe("ja");
  expect(await doc.innerText()).not.toMatch(/[가-힣]/);
});

test("가이드 링크: 운영 화면에서 링크를 만들고, 가이드가 체크·기록하면 회사 화면에서 불러온다", async ({ page, context }) => {
  await mockAi(page);
  await seed(page);
  await page.goto("/");
  const ops = page.locator("#ops-panel");
  await ops.getByRole("button", { name: /출발 준비 · 명단 · 정산/ }).click();
  await ops.getByRole("tab", { name: "가이드 링크·현장 기록" }).click();
  await ops.getByRole("button", { name: "가이드 링크 만들기" }).click();
  await expect(ops.getByText("가이드 링크를 만들었습니다.")).toBeVisible();
  const url = await ops.locator('a[href*="/g/"]').getAttribute("href");
  expect(url).toMatch(/\/g\/[\w-]+$/);

  const guide = await context.newPage();
  await guide.goto(url!);
  await expect(guide.getByText("다낭 핵심 3일")).toBeVisible();
  await guide.getByRole("checkbox").first().check();
  await guide.getByRole("button", { name: "일정 변경" }).click();
  await guide.getByLabel("기록 내용").fill("비로 오행산 → 참 박물관");
  await guide.getByRole("button", { name: "기록 남기기" }).click();
  await expect(guide.getByRole("region", { name: "현장 기록" })).toContainText("[일정 변경] 비로 오행산 → 참 박물관");

  await page.bringToFront();
  await ops.getByRole("button", { name: "현장 기록 불러오기" }).click();
  await expect(ops.getByText(/진행 체크 1건 · 기록 1건/)).toBeVisible();
  await expect(ops).toContainText("비로 오행산 → 참 박물관");
});

test("웹 견적 요청: 고객이 /q에서 남긴 요청이 예약 관리에 보이고, 입력에 채울 수 있다", async ({ page, context }) => {
  await mockAi(page);
  await seed(page);
  const form = await context.newPage();
  await form.goto("/q?c=세미투어");
  const name = `E2E 고객 ${Date.now() % 100000}`;
  await form.getByLabel("이름 *").fill(name);
  await form.getByLabel("연락처 (전화·이메일·카톡 ID) *").fill("010-1234-5678");
  await form.getByLabel("가고 싶은 곳 *").fill("나트랑");
  await form.getByLabel("박수").fill("3");
  await form.getByLabel("인원 *").fill("5");
  await form.getByRole("button", { name: "견적 요청하기" }).click();
  await expect(form.getByText("요청을 받았습니다. 곧 연락드리겠습니다!")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "예약 관리" }).click();
  const dlg = page.getByRole("dialog", { name: "예약 관리" });
  const inbox = dlg.getByRole("region", { name: "웹 견적 요청" });
  const row = inbox.getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("나트랑");
  await row.getByRole("button", { name: "입력에 채우기" }).click();
  // 창이 닫히고 입력 화면으로
  await expect(dlg).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:input:v1") ?? "{}"));
  expect(saved).toMatchObject({ destination: "나트랑", travelers: 5, nights: 3, days: 4 });
});
