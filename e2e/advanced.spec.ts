import { expect, test, type Page } from "@playwright/test";
import { mockAi } from "./mocks";

// 요금표·오후 자유시간·품질 점수·수배 확정·웹 일정표 예약 요청·일본어 웹 일정표

const sight = (id: string, name: string, stay = 60) => ({ id, type: "sightseeing", admission: "enter", name, description: "", stayMinutes: stay, travelMinutesToNext: 15, entryFee: 0, mealCost: 0, isEstimated: true });
const lunch = (id: string) => ({ id, type: "meal", admission: "none", name: "점심 현지식", description: "", stayMinutes: 60, travelMinutesToNext: 15, entryFee: 0, mealCost: 15000, isEstimated: true, cuisine: "현지식" });
const day = (n: number, items: unknown[]) => ({ day: n, theme: `DAY ${n}`, kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], items });
// DAY 1은 11시쯤 끝나 오후가 빈다
const DAYS = [day(1, [sight("a", "한 시장", 90)]), day(2, [sight("b", "오행산", 120), lunch("l2"), sight("c", "호이안 올드타운", 180)]), day(3, [sight("d", "린응사", 90)])];
const work = { days: DAYS, pmChoice: {}, meta: { packageName: "다낭 3일", cities: ["다낭"], noShopping: true, noOption: true, hotelGrade: "4성급", highlights: [] }, generatedCurrency: "KRW", usps: [], uspKey: null };
const input = {
  destination: "다낭",
  days: 3,
  nights: 2,
  travelers: 4,
  departureDate: "2026-11-05",
  vehicleCostPerDay: 150000,
  guideCostPerDay: 100000,
  pricingMode: "target_margin",
  targetMarginRate: 20,
  selectedHotels: { 다낭: { name: "노보텔 다낭", grade: "4성급", area: "", nearestStation: "", walkMinutes: 0, nightlyLow: 0, nightlyHigh: 0, priceBasis: "searched", mapUrl: "" } },
  options: [{ id: "opt1", name: "한강 야경 크루즈", dayNo: 1, pricePerPerson: 30000, costPerPerson: 20000, minParticipants: 2, durationMinutes: 90, category: "night", description: "" }],
};

async function seed(page: Page) {
  await mockAi(page);
  await page.addInitScript(
    ([w, i]) => {
      window.print = () => undefined;
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("semitour-planner:input:v1", JSON.stringify(i));
      localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
      localStorage.setItem("semitour.autoEngineCheck", "0");
    },
    [work, input] as const,
  );
}

test("요금표: 계약 요금을 넣으면 숙박 시세 조회가 검색 없이 요금표를 쓴다", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  const city = `요금도시${Date.now() % 100000}`;
  await page.getByRole("button", { name: "더보기" }).click();
  await page.getByRole("button", { name: "요금표" }).click();
  const dlg = page.getByRole("dialog", { name: "요금표" });
  await dlg.getByLabel("요금 도시").fill(city);
  await dlg.getByLabel("호텔·차종 이름").fill("노보텔 테스트");
  await dlg.getByLabel("요금", { exact: true }).fill("85000");
  await dlg.getByLabel("업체").fill("○○랜드사");
  await dlg.getByRole("button", { name: "넣기" }).click();
  await expect(dlg.getByRole("status")).toContainText("노보텔 테스트 요금을 넣었습니다");
  await expect(dlg.getByRole("region", { name: "호텔 요금" })).toContainText("85,000 KRW");

  // 서버의 숙박 시세 조회는 요금표에 있으면 검색하지 않는다
  const r = await page.request.post("/api/search-lodging-price", { data: { destination: city, lodgingType: "hotel", hotelGrade: "4", currency: "KRW", hotelNames: ["노보텔 테스트"] } });
  const j = (await r.json()) as { fromBook?: boolean; estimate: { hotels: { rateHigh: number; sourceName: string }[] } };
  expect(j.fromBook).toBe(true);
  expect(j.estimate.hotels[0]).toMatchObject({ rateHigh: 85000 });
  expect(j.estimate.hotels[0].sourceName).toContain("○○랜드사 견적가");
});

test("일찍 끝나는 날은 일정표에 '오후 자유시간' 줄, 품질 점수 카드", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  const card = page.locator("#quality");
  await expect(card.getByRole("button", { name: /일정표 품질 \d+점/ })).toBeVisible();
  await card.getByRole("button", { name: /일정표 품질/ }).click();
  await expect(card.getByRole("list", { name: "품질 점수" })).toContainText("코스 근거");
  await expect(card.getByRole("list", { name: "품질 점수" })).toContainText("원가 확인");

  await page.getByRole("button", { name: /^여행일정표/ }).first().click();
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole("checkbox").check();
    await confirm.getByRole("button", { name: "인쇄" }).click();
  }
  await expect(page.locator(".print-root")).toContainText("오후 자유시간 (호텔 휴식 또는 개별 관광)");
});

test("수배·확정: 업체와 확정 번호를 적으면 확정, 업체별 요청 문구", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  const ops = page.locator("#ops-panel");
  await ops.getByRole("button", { name: /출발 준비 · 명단 · 정산/ }).click();
  await ops.getByRole("tab", { name: /수배·확정 0\// }).click();
  const table = ops.getByRole("table", { name: "수배 목록" });
  await expect(table).toContainText("노보텔 다낭");
  await expect(table).toContainText("한강 야경 크루즈");
  await table.getByLabel("노보텔 다낭 업체").fill("노보텔 예약실");
  await table.getByLabel("노보텔 다낭 확정 번호").fill("NV-1234");
  await table.getByLabel("노보텔 다낭 메모").click();
  await expect(table.getByLabel("노보텔 다낭 상태")).toHaveValue("confirmed");
  await expect(ops.getByRole("tab", { name: /수배·확정 1\// })).toBeVisible();
  await expect(ops.getByRole("button", { name: "노보텔 예약실 (1)" })).toBeVisible();
});

test("고객 웹 일정표: 예약 요청이 웹 견적 요청함으로 들어오고, 일본어 링크도 만든다", async ({ page, context }) => {
  await seed(page);
  await page.route("**/api/translate-doc", async (r) => {
    const { texts } = r.request().postDataJSON() as { texts: string[] };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ translations: texts.map((t) => (t === "한 시장" ? "ハン市場" : `JA:${t}`)) }) });
  });
  await page.goto("/");
  const box = page.getByRole("region", { name: "고객용 웹 일정표" });
  await box.getByRole("button", { name: "링크 만들기" }).click();
  const url = await box.getByRole("status").filter({ hasText: "/t/" }).getByRole("link").getAttribute("href");

  const guest = await context.newPage();
  await guest.goto(url!);
  const form = guest.getByRole("region", { name: "이 일정으로 예약 요청" });
  const name = `웹고객${Date.now() % 100000}`;
  await form.getByLabel("이름 *").fill(name);
  await form.getByLabel("연락처 (전화·카톡 ID·이메일) *").fill("010-2222-3333");
  await form.getByRole("checkbox", { name: /한강 야경 크루즈/ }).check();
  await form.getByRole("button", { name: "예약 요청 보내기" }).click();
  await expect(guest.getByText("예약 요청을 받았습니다")).toBeVisible();

  await page.bringToFront();
  await page.getByRole("button", { name: "예약 관리" }).click();
  const inbox = page.getByRole("dialog", { name: "예약 관리" }).getByRole("region", { name: "웹 견적 요청" });
  const row = inbox.getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("웹 일정표 예약 요청");
  await expect(row).toContainText("선택관광 한강 야경 크루즈");
  await page.keyboard.press("Escape");

  await box.getByLabel("웹 일정표 언어").selectOption("ja");
  await box.getByRole("button", { name: "일본어 링크 만들기" }).click();
  const jaUrl = await box.getByRole("status").filter({ hasText: "/t/" }).getByRole("link").getAttribute("href");
  expect(jaUrl).not.toBe(url);
  await guest.goto(jaUrl!);
  await expect(guest.getByText("ハン市場")).toBeVisible();
  await expect(guest.getByRole("heading", { name: "この日程で予約をリクエスト" })).toBeVisible();
});

test("식사 시간 점검: 저녁이 21시 넘으면 일정 카드에 경고, [식사 시간 맞추기]로 당긴다", async ({ page }) => {
  await mockAi(page);
  const s = (id: string, name: string, stay: number, next = 30) => ({ id, type: "sightseeing", admission: "enter", name, description: "", stayMinutes: stay, travelMinutesToNext: next, entryFee: 0, mealCost: 0, isEstimated: true });
  const late = {
    days: [
      { day: 1, theme: "DAY 1", kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], meetingTime: "08:00", items: [s("a", "오행산", 190), s("b", "린응사", 190), s("c", "한 시장", 190), s("e", "용다리", 80), { id: "d", type: "meal", admission: "none", name: "저녁 식사", description: "", stayMinutes: 60, travelMinutesToNext: 0, entryFee: 0, mealCost: 15000, isEstimated: true }] },
      { day: 2, theme: "DAY 2", kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], items: [s("f", "바나힐", 120)] },
    ],
    pmChoice: {},
    meta: null,
    generatedCurrency: "KRW",
    usps: [],
    uspKey: null,
  };
  await page.addInitScript((w) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ destination: "다낭", days: 2, nights: 1, travelers: 4 }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
    localStorage.setItem("semitour.autoEngineCheck", "0");
  }, late);
  await page.goto("/");
  const day1 = page.locator("#day-1");
  const issues = day1.getByRole("list", { name: "식사 시간 점검" });
  await day1.getByRole("button", { name: /이 날 확인할 것/ }).click();
  await expect(issues).toContainText("저녁이 20:50 시작 — 너무 늦음");
  await day1.getByRole("button", { name: "식사 시간 맞추기" }).click();
  await expect(issues).toHaveCount(0);
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}").days[0].items.map((i: { name: string }) => i.name));
  expect(names.indexOf("저녁 식사")).toBeLessThan(names.indexOf("용다리"));
});

test("코스 재정렬: 추천 순서를 미리 비교하고 적용, 되돌리기", async ({ page }) => {
  await mockAi(page);
  const s = (id: string, name: string) => ({ id, type: "sightseeing", admission: "enter", name, description: "", stayMinutes: 60, travelMinutesToNext: 40, entryFee: 0, mealCost: 0, isEstimated: true });
  const w = {
    days: [{ day: 1, theme: "DAY 1", kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], meetingTime: "09:00", items: [s("a", "오행산"), s("b", "린응사"), s("c", "한 시장"), s("d", "용다리")] }],
    pmChoice: {},
    meta: null,
    generatedCurrency: "KRW",
    usps: [],
    uspKey: null,
  };
  await page.addInitScript((work) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ destination: "다낭", days: 1, nights: 0, travelers: 4 }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(work));
    localStorage.setItem("semitour.autoEngineCheck", "0");
  }, w);
  // 엔진: 지금 순서 62점, 추천(거꾸로) 88점
  await page.route("**/api/engine/plan", async (r) => {
    const body = r.request().postDataJSON() as { places: { id: string; name: string; stayMin: number }[] };
    const mk = (ids: string[]) => {
      let t = 540;
      const timeline = ids.map((id, k) => {
        const p = body.places.find((x) => x.id === id)!;
        const stop = { id, name: p.name, arrive: t, start: t, end: t + 60, travelFromPrev: k ? 10 : 0, wait: 0, issues: [] };
        t += 70;
        return stop;
      });
      return { order: ids, timeline, violations: [], dropped: [], totalTravel: 30, totalWait: 0, endTime: t, savedTravel: 0, method: "exhaustive" };
    };
    const ids = body.places.map((p) => p.id);
    const q = (score: number) => ({ score, grade: score >= 80 ? "B" : "D", items: [], fixes: [] });
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ current: mk(ids), best: mk([...ids].reverse()), quality: q(62), bestQuality: q(88), places: [], context: { weekday: null, holiday: null, sunset: null, sunrise: null, matrix: "estimate", looked: 0, known: ids.length } }) });
  });
  await page.goto("/");
  await page.locator("#day-1").getByRole("button", { name: "재정렬" }).click();
  const dlg = page.getByRole("dialog", { name: "DAY 1 코스 재정렬" });
  const cmp = dlg.getByRole("list", { name: "재정렬 비교" });
  await expect(cmp).toContainText("점검 62 → 88점");
  await expect(cmp).toContainText("추천 순서");
  await expect(dlg.getByRole("list", { name: "DAY 1 바꾼 뒤" }).getByRole("listitem").first()).toHaveText("용다리");
  await dlg.getByRole("button", { name: "이 순서로 적용" }).click();
  const order = () => page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:work:v1") ?? "{}").days[0].items.map((i: { name: string }) => i.name));
  await expect.poll(order).toEqual(["용다리", "한 시장", "린응사", "오행산"]);
  await page.keyboard.press("Control+z");
  await expect.poll(order).toEqual(["오행산", "린응사", "한 시장", "용다리"]);
});
