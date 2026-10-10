import { expect, test, type Page } from "@playwright/test";
import { mockAi } from "./mocks";

// 지식 창고 · 일정 강도 · 고객 니즈 — 우리 자료(다른 여행사 일정·고객 추천)로 쌓인 지식을 보고 고치고,
// 힘든 날 다음 날을 가볍게 바꾸며, 고객 후기의 "좋았던 곳"이 지식 창고에 쌓인다

const uniq = () => `E2E도시${Date.now() % 1_000_000}`;

test("지식 창고: 쌓인 장소를 점수순으로 보고, 확인·직접 추가한다", async ({ page }) => {
  await mockAi(page);
  await page.goto("/");
  const city = uniq();
  expect((await page.request.post("/api/knowledge/learn", { data: { kind: "competitor", city, agency: "하나투어", title: "4일", days: [["바나힐", "골든브릿지"], ["오행산"]] } })).ok()).toBe(true);
  expect((await page.request.post("/api/knowledge/learn", { data: { kind: "votes", city, best: ["오행산"], worst: [] } })).ok()).toBe(true);

  await page.getByRole("button", { name: "더보기" }).click();
  await page.getByRole("button", { name: "지식 창고" }).click();
  const dlg = page.getByRole("dialog", { name: "지식 창고" });
  await dlg.getByRole("radio", { name: new RegExp(city) }).click();
  const rows = dlg.getByRole("table", { name: "장소 목록" }).getByRole("row");
  // 오행산: 여행사 1곳 + 우리 고객 추천 → 1위
  await expect(rows.nth(1)).toContainText("오행산");
  await expect(rows.nth(1)).toContainText("우리 고객 추천 1");
  await expect(dlg.getByRole("tab", { name: /인기 코스 1/ })).toBeVisible();

  await rows.filter({ hasText: "바나힐" }).getByRole("checkbox").check();
  await expect(dlg.getByRole("status")).toContainText("바나힐 — 직원 확인");

  await dlg.getByLabel("추가할 장소", { exact: true }).fill("미케 비치");
  await dlg.getByRole("button", { name: "추가", exact: true }).click();
  await expect(rows.filter({ hasText: "미케 비치" })).toContainText("직원 확인");
});

const sight = (id: string, name: string, stay: number, travel = 15) => ({ id, type: "sightseeing", admission: "enter", name, description: "", stayMinutes: stay, travelMinutesToNext: travel, entryFee: 0, mealCost: 0, isEstimated: true });
const lunch = (id: string) => ({ id, type: "meal", admission: "none", name: "점심 현지식", description: "", stayMinutes: 60, travelMinutesToNext: 15, entryFee: 0, mealCost: 10000, isEstimated: true, cuisine: "현지식" });
const day = (n: number, items: unknown[]) => ({ day: n, theme: `DAY ${n}`, kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], items });

async function seedHeavy(page: Page) {
  const days = [
    day(1, [sight("a", "바나힐", 300, 120), lunch("l1"), sight("b", "골든브릿지", 180)]),
    day(2, [sight("c", "한 시장", 60), lunch("l2"), sight("d", "오행산", 90)]),
    day(3, [sight("e", "린응사", 60)]),
  ];
  await page.addInitScript(
    ([w, i]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("semitour-planner:input:v1", JSON.stringify(i));
      localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
      // 자동 코스 점검은 이 테스트와 상관없어 끈다
      localStorage.setItem("semitour.autoEngineCheck", "0");
    },
    [
      { days, pmChoice: {}, meta: { packageName: "다낭 3일", cities: ["다낭"], noShopping: true, noOption: true, hotelGrade: "4성급", highlights: [] }, generatedCurrency: "KRW", usps: [], uspKey: null },
      { destination: "다낭", days: 3, nights: 2, travelers: 4, pace: "normal", companions: ["couple"], mustHave: "야시장", avoid: "", vehicleCostPerDay: 150000, guideCostPerDay: 100000, pricingMode: "target_margin", targetMarginRate: 20 },
    ] as const,
  );
}

test("일정 강도: 힘든 날 다음 날을 늦은 출발로 바꾸고, 고객 니즈를 점검한다", async ({ page }) => {
  await mockAi(page);
  await seedHeavy(page);
  await page.goto("/");
  const panel = page.locator("#pace");
  await expect(panel.getByRole("list", { name: "날짜별 강도" })).toContainText("DAY 1 힘든 날");
  const check = panel.getByRole("list", { name: "강도 점검" });
  await expect(check).toContainText("DAY 1이(가) 힘든 날");
  await check.getByRole("button", { name: "DAY 2 늦은 출발 (10:00 미팅)" }).click();
  await expect(panel.getByRole("list", { name: "날짜별 강도" })).toContainText("DAY 2 오전 자유 · 늦은 출발");
  await expect(page.getByText("오전 자유 · 늦은 출발").first()).toBeVisible();

  const needs = panel.getByRole("region", { name: "고객 니즈 점검" });
  await expect(needs).toContainText('꼭 넣을 것 "야시장"이(가) 일정에 없습니다');
  await expect(needs).toContainText("야경·일몰 일정이 없습니다");

  // 되돌리기 (전체 되돌리기 기록에 '쉬는 날'로)
  await page.keyboard.press("Control+z");
  await expect(check).toContainText("DAY 1이(가) 힘든 날");
});

test("고객 후기: 좋았던 곳을 고르면 지식 창고에 쌓인다", async ({ page }) => {
  await mockAi(page);
  await page.goto("/");
  const city = uniq();
  const r = await page.request.post("/api/review-link", { data: { title: "다낭 3일 후기", planName: "다낭 3일", company: "세미투어", city, places: ["바나힐", "오행산"] } });
  expect(r.ok()).toBe(true);
  const { path } = (await r.json()) as { path: string };
  await page.goto(path);
  await page.getByRole("radiogroup", { name: "전체 만족도" }).getByRole("radio", { name: "5점" }).click();
  await page.getByRole("group", { name: /가장 좋았던 곳/ }).getByRole("button", { name: "바나힐" }).click();
  await page.getByRole("group", { name: /아쉬웠던 곳/ }).getByRole("button", { name: "오행산" }).click();
  await page.getByRole("button", { name: "후기 보내기" }).click();
  await expect(page.getByText("소중한 의견 감사합니다!")).toBeVisible();

  const k = (await (await page.request.get(`/api/knowledge?city=${encodeURIComponent(city)}`)).json()) as { doc: { places: { name: string; votes?: { best: number; worst: number } }[] } };
  expect(k.doc.places.find((p) => p.name === "바나힐")?.votes).toEqual({ best: 1, worst: 0 });
  expect(k.doc.places.find((p) => p.name === "오행산")?.votes).toEqual({ best: 0, worst: 1 });
});

test("지식 창고: 발전 지표와, 웹 조사로 새로 들어온 곳의 검수 대기", async ({ page }) => {
  await mockAi(page);
  await page.goto("/");
  const city = uniq();
  await page.request.post("/api/knowledge/learn", { data: { kind: "edits", city, removed: ["쇼핑센터"], added: [] } });
  const card = (name: string, pending: boolean) => ({ key: name, name, area: "", kind: "sight", popularity: 80, seen: 1, agencies: ["하나투어"], fits: [], likes: ["전망"], dislikes: [], tips: [], stayWeb: 60, fieldNotes: [], sources: [{ title: "블로그", url: "https://example.com/x" }], verified: false, pending, updatedAt: "" });
  await page.route("**/api/knowledge/research", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ researched: true, doc: { city, places: [card("새 전망대", true), card("오래된 곳", false)], courses: [], needs: [], fieldNotes: [], researchedAt: new Date().toISOString(), researchCount: 1, learnedCount: 0, updatedAt: "" } }) }),
  );
  await page.getByRole("button", { name: "더보기" }).click();
  await page.getByRole("button", { name: "지식 창고" }).click();
  const dlg = page.getByRole("dialog", { name: "지식 창고" });
  await expect(dlg.getByRole("table", { name: "발전 지표" })).toBeVisible();
  await dlg.getByLabel("조사할 도시").fill(city);
  await dlg.getByRole("button", { name: "웹에서 (다시) 조사" }).click();
  await dlg.getByRole("tab", { name: "검수 대기 1" }).click();
  const queue = dlg.getByRole("list", { name: "검수 대기" });
  await expect(queue).toContainText("새 전망대");
  await expect(queue).not.toContainText("오래된 곳");
  await expect(queue.getByRole("link", { name: /출처: 블로그/ })).toBeVisible();
});
