import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

const item = (id: string, name: string, stay: number, travel: number, type = "sightseeing", lat?: number, lng?: number) => ({
  id, type, name, description: "", stayMinutes: stay, travelMinutesToNext: travel, entryFee: 0, mealCost: 0, isEstimated: true, ...(lat ? { lat, lng } : {}),
  ...(type === "meal" ? { mealSlot: "lunch" } : {}),
});
const day = (n: number, items: ReturnType<typeof item>[]) => ({ day: n, theme: `DAY ${n}`, kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: "후쿠오카", meetingTime: "09:00" });
const DAYS = [
  day(1, [item("a", "다자이후 텐만구", 90, 30, "sightseeing", 33.519, 130.535), item("l", "점심 식사 (현지식)", 60, 20, "meal"), item("b", "후쿠오카 타워", 60, 20, "sightseeing", 33.593, 130.351), item("c", "캐널시티", 60, 0, "shopping", 33.589, 130.411)]),
  day(2, [item("d", "유후인 민예촌", 60, 10, "sightseeing", 33.263, 131.356), item("e", "긴린코 호수", 30, 0, "sightseeing", 33.266, 131.369)]),
];

test("고객 코스 만들기: 3단계 입력 → 코스 → 빼기·다른 날로 → 견적 요청이 직원 견적 요청함에 코스와 함께 들어오고, 이 코스로 견적을 시작한다", async ({ page, context }) => {
  const customer = await context.newPage();
  await customer.route("**/api/public-plan/recommend**", (r) => r.fulfill({ json: { courses: [{ title: "후쿠오카 핵심 1일", places: ["다자이후 텐만구", "후쿠오카 타워"], note: "" }], popular: [{ name: "오호리 공원", count: 3 }] } }));
  const sent: Record<string, unknown>[] = [];
  await customer.route("**/api/public-plan", async (r) => {
    if (r.request().method() !== "POST") return r.continue();
    sent.push(r.request().postDataJSON() as Record<string, unknown>);
    await r.fulfill({ json: { days: DAYS, source: "knowledge", note: "우리 여행사 지식 창고의 인기 장소로 만든 코스입니다" } });
  });
  await customer.goto("/plan");
  // 한 화면: 여행지·기간만 넣고 버튼 한 번
  await customer.getByLabel("여행지").fill("후쿠오카");
  await customer.getByLabel("기간").selectOption("1");
  await customer.getByRole("button", { name: "바로 코스 만들기" }).click();
  await expect(customer.getByRole("region", { name: "내 코스" })).toContainText("다자이후 텐만구");
  expect(sent[0]).toMatchObject({ destination: "후쿠오카", nights: 1, days: 2, companions: [], pace: "normal", themes: [], mustSee: [], style: "free_tour", services: ["flight", "hotel", "tour", "esim", "insurance"] });
  // 여행 방식 5가지 — 기본은 자유여행 + 투어 추가
  const cond = customer.getByRole("group", { name: "여행 방식" });
  await expect(cond.getByRole("button")).toHaveCount(5);
  await expect(cond.getByRole("button", { name: /자유여행 \+ 투어 추가/ })).toHaveAttribute("aria-pressed", "true");

  // 더 맞추기(선택) → 추천 코스로 바로 만들기
  await customer.getByText(/더 맞추고 싶으면/).click();
  // 맡길 것 — 유심·보험 등을 빼고 넣기
  const sv = customer.getByRole("group", { name: "우리가 해 드릴 것" });
  await sv.getByText("교통패스").click();
  await sv.getByText("항공권").click();
  await customer.getByRole("region", { name: "코스 조건" }).getByRole("button", { name: "부모님" }).click();
  await customer.getByRole("region", { name: "코스 조건" }).getByRole("button", { name: "여유롭게" }).click();
  await customer.getByRole("region", { name: "코스 조건" }).getByRole("button", { name: "먹방" }).click();
  await customer.getByRole("button", { name: /추천 코스로 바로 만들기 · 후쿠오카 핵심 1일/ }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({ companions: ["senior"], pace: "relaxed", themes: ["food"], mustSee: ["다자이후 텐만구", "후쿠오카 타워"], services: ["hotel", "tour", "esim", "insurance", "pass"] });

  // 결과 화면의 칩 — 누르면 그 조건으로 바로 다시
  await customer.getByRole("region", { name: "내 코스" }).getByRole("button", { name: "친구" }).click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toMatchObject({ companions: ["senior", "friends"] });

  const result = customer.getByRole("region", { name: "내 코스" });
  await expect(result).toContainText("다자이후 텐만구");
  await expect(result.getByRole("region", { name: "한눈에 보기" })).toContainText("후쿠오카 2박");
  await expect(result.getByRole("button", { name: "동선 재생" })).toBeVisible();
  // 자유여행 안내 — 교통패스·숙소 구역·장소 사이 이동·길찾기
  const guide = result.getByRole("region", { name: "자유여행 준비" });
  await expect(guide).toContainText("JR 규슈");
  await expect(guide).toContainText("eSIM");
  await expect(customer.locator("#plan-day-1").getByRole("link", { name: "길찾기" }).first()).toHaveAttribute("href", /google\.com\/maps\/dir/);
  // 이 날 가이드 투어로 → 그날은 셀프 이동 안내 대신 투어 표시 · 야경 투어 추가
  await customer.locator("#plan-day-2").getByRole("button", { name: "이 날 가이드 투어로" }).click();
  await expect(customer.locator("#plan-day-2")).toContainText("가이드 투어");
  await expect(customer.locator("#plan-day-2").getByRole("link", { name: "길찾기" })).toHaveCount(0);
  await customer.locator("#plan-day-1").getByRole("button", { name: "+ 야경 투어" }).click();
  await expect(customer.locator("#plan-day-1")).toContainText("야경 투어");
  await result.getByRole("button", { name: "캐널시티 빼기" }).click();
  await expect(customer.locator("#plan-day-1")).not.toContainText("캐널시티");
  await result.getByLabel("긴린코 호수 다른 날로 옮기기").selectOption("1");
  await expect(customer.locator("#plan-day-1")).toContainText("긴린코 호수");

  await result.getByRole("button", { name: "이 코스로 견적 받기" }).click();
  const q = result.getByRole("region", { name: "견적 받기" });
  const name = `코스 고객 ${Date.now() % 100000}`;
  await q.getByLabel("이름", { exact: true }).fill(name);
  await q.getByLabel("연락처", { exact: true }).fill("010-2222-3333");
  await q.getByLabel("연락 방법").selectOption("전화");
  await expect(q.getByRole("button", { name: "견적 요청 보내기" })).toBeDisabled();
  await q.getByRole("checkbox").check();
  await q.getByRole("button", { name: "견적 요청 보내기" }).click();
  await expect(q).toContainText("견적 요청을 보냈습니다");

  // 직원 화면 — 견적 요청함에 고객 코스, [이 코스로 견적 시작]
  await mockAi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "예약 관리" }).click();
  const dlg = page.getByRole("dialog", { name: "예약 관리" });
  const row = dlg.getByRole("region", { name: "웹 견적 요청" }).getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("고객 코스");
  await expect(row).toContainText("DAY 1 다자이후 텐만구");
  await expect(row).toContainText("자유여행 + 투어 추가 · 투어 1일");
  await expect(row).toContainText("eSIM·유심");
  await expect(row).toContainText("연락: 전화");
  await row.getByRole("button", { name: "이 코스로 견적 시작" }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator("#day-1")).toContainText("긴린코 호수", { timeout: 15_000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:input:v1") ?? "{}"));
  expect(saved).toMatchObject({ destination: "후쿠오카", customerName: name, mode: "ai", operatingModel: "airtel", includesFlights: false, packageType: "land_hotel" });
});

test("꼭 가볼 곳(한국인 인기·가는 방법·코스에 넣기) + 우리에게 요청하기(항공권·호텔·유심 → 예약 요청)가 직원 견적 요청함에 항목별로 들어온다", async ({ page, context }) => {
  const customer = await context.newPage();
  await customer.route("**/api/public-plan/recommend**", (r) => r.fulfill({ json: { courses: [], popular: [] } }));
  await customer.route("**/api/public-plan/spots**", (r) =>
    r.fulfill({
      json: {
        city: "후쿠오카",
        center: { lat: 33.5902, lng: 130.4207 },
        source: "knowledge",
        spots: [
          { name: "다자이후 텐만구", area: "다자이후", kind: "sight", why: "학문의 신 신사 · 한국 여행사 일정 3곳에 포함", tips: ["오전이 한산"], stayMin: 90, korean: true, lat: 33.519, lng: 130.535 },
          { name: "오호리 공원", area: "주오구", kind: "sight", why: "호수 산책", tips: [], stayMin: 60, korean: false, lat: 33.586, lng: 130.376 },
        ],
      },
    }),
  );
  const sent: Record<string, unknown>[] = [];
  await customer.route("**/api/public-plan", async (r) => {
    if (r.request().method() !== "POST") return r.continue();
    sent.push(r.request().postDataJSON() as Record<string, unknown>);
    await r.fulfill({ json: { days: DAYS, source: "knowledge", note: "" } });
  });
  await customer.goto("/plan");
  await customer.getByLabel("여행지").fill("후쿠오카");
  await customer.getByLabel("기간").selectOption("1");

  // 꼭 가볼 곳 — 방식과 상관없이 (패키지로 바꿔도)
  await customer.getByRole("group", { name: "여행 방식" }).getByRole("button", { name: /패키지$/ }).first().click();
  const spots = customer.getByRole("region", { name: "꼭 가볼 곳" });
  await expect(spots).toContainText("후쿠오카 꼭 가볼 곳");
  await expect(spots).toContainText("한국인 인기");
  await expect(spots).toContainText("오전이 한산");
  await spots.getByRole("button", { name: "가는 방법" }).first().click();
  await expect(spots).toContainText("도심에서 전용차량 약");
  await expect(spots.getByRole("link", { name: "공항에서 길찾기" })).toHaveAttribute("href", /google\.com\/maps\/dir/);
  await spots.getByRole("button", { name: "오호리 공원 코스에 넣기" }).click();
  await expect(spots).toContainText("✓ 코스에 있음");
  await customer.getByRole("button", { name: "바로 코스 만들기" }).click();
  await expect(customer.getByRole("region", { name: "내 코스" })).toContainText("다자이후 텐만구");
  expect(sent[0]).toMatchObject({ style: "package", mustSee: ["오호리 공원"] });
  // 패키지도 장소 사이 이동(전용차량) 표시
  await expect(customer.locator("#plan-day-1")).toContainText("전용차량 약");

  // 우리에게 요청하기 — 바로가기 → 항공권·호텔·유심
  await customer.getByRole("link", { name: /우리에게 요청하기/ }).click();
  const ask = customer.getByRole("region", { name: "우리에게 요청하기" });
  await ask.getByRole("button", { name: /항공권/ }).click();
  await ask.getByRole("button", { name: /호텔/ }).click();
  await ask.getByRole("button", { name: /eSIM·유심/ }).click();
  await expect(ask.getByLabel("호텔 지역·구역")).toHaveValue(/주변/);
  await expect(ask.getByLabel("항공권 출발 공항")).toHaveValue("인천");
  await ask.getByLabel("호텔 박수").fill("2");
  await ask.getByLabel("eSIM·유심 휴대폰").selectOption("갤럭시");
  const name = `요청 고객 ${Date.now() % 100000}`;
  await ask.getByLabel("요청 이름").fill(name);
  await ask.getByLabel("요청 연락처").fill("010-4444-5555");
  await expect(ask.getByRole("button", { name: /예약 요청/ })).toBeDisabled();
  await ask.getByLabel("요청 개인정보 동의").check();
  await ask.getByRole("button", { name: /예약 요청/ }).click();
  await expect(ask.getByRole("status")).toContainText("예약 요청을 보냈습니다 — 항공권 · 호텔 · eSIM·유심");

  // 직원 화면 — 예약 요청 배지·항목별 내용, [입력에 채우기]로 항공 포함·상품 구성
  await mockAi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "예약 관리" }).click();
  const dlg = page.getByRole("dialog", { name: "예약 관리" });
  const row = dlg.getByRole("region", { name: "웹 견적 요청" }).getByRole("listitem").filter({ hasText: name });
  const asks = row.getByLabel("요청 항목");
  await expect(asks).toContainText("예약 요청");
  await expect(asks).toContainText("항공권 · 호텔 · eSIM·유심");
  await expect(asks).toContainText("호텔 — 지역·구역");
  await expect(asks).toContainText("박수 2");
  await expect(asks).toContainText("휴대폰 갤럭시");
  await expect(row).toContainText("고객 코스");
  await row.getByRole("button", { name: "입력에 채우기" }).click();
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("semitour-planner:input:v1") ?? "{}")))
    .toMatchObject({ destination: "후쿠오카", includesFlights: true, packageType: "full" });
});

test("쇼핑몰 안 표시 허용: 고객 화면만 skcbook.com에 허용, 직원 화면은 막는다 · embed.js 버튼", async ({ page, request }) => {
  const plan = await request.get("/plan");
  expect(plan.headers()["content-security-policy"]).toContain("https://skcbook.com");
  const staff = await request.get("/");
  expect(staff.headers()["content-security-policy"]).toBe("frame-ancestors 'self'");
  expect(staff.headers()["x-frame-options"]).toBe("SAMEORIGIN");

  await page.goto("/plan?embed=1");
  await expect(page.getByRole("heading", { name: "내 여행 코스 만들기" })).toHaveCount(0);
  await page.setContent(`<html><body><p>쇼핑몰</p><script src="${new URL(page.url()).origin}/embed.js" data-mode="button" data-label="✈ 코스 만들기"></script></body></html>`);
  await page.getByRole("button", { name: "✈ 코스 만들기" }).click();
  await expect(page.getByRole("dialog", { name: "내 여행 코스 만들기" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "내 여행 코스 만들기" })).toHaveCount(0);
});
