import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

const imported = {
  found: true, productName: "오사카 교토 3일", agency: "노랑풍선", destination: "오사카, 일본", departureDate: "2027-01-04", nights: 2, days: 3,
  pricePerPerson: 899000, priceNote: "유류할증료 포함", hotel: "",
  outbound: { airline: "대한항공", flightNumber: "KE723", date: "2027-01-04", departAirport: "인천(ICN)", departTime: "10:00", arriveAirport: "간사이(KIX)", arriveTime: "12:00" },
  inbound: { airline: "대한항공", flightNumber: "KE724", date: "2027-01-06", departAirport: "간사이(KIX)", departTime: "20:00", arriveAirport: "인천(ICN)", arriveTime: "22:00" },
  mustSee: ["오사카성", "기요미즈데라"], included: [], excluded: [], shopping: 0, optionTours: [], guideFee: "", cancelPolicy: "", courseDetail: true,
  courseText: "제1일 인천 출발 ... 제3일 귀국", url: "https://pkgtour.naver.com/products/ybtour/X", readDirect: true, sources: [],
};
const item = (id: string, name: string, stay: number, type = "sightseeing") => ({ id, type, name, description: "", stayMinutes: stay, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: false, admission: "none" });
const day = (n: number, items: ReturnType<typeof item>[], rest?: string) => ({ day: n, theme: `Day ${n}`, kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: "오사카", ...(rest ? { rest } : {}) });

test("상품 링크: 읽고 → 이 상품 기준으로 우리 코스 → 판매가 역계산, 비어 온 도착일 오후는 자동으로 채운다", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/import-product", (r) => r.fulfill({ json: imported }));
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/generate-itinerary", async (r) => {
    sent = r.request().postDataJSON() as Record<string, unknown>;
    await r.fulfill({
      json: {
        // AI가 도착일을 비워 보냄 (예전엔 "전일 자유일정"이 되어 오후가 빈 채로 다음 날부터 투어)
        days: [day(1, [item("f1", "전일 자유일정", 480, "free_time")], "free"), day(2, [item("b1", "교토 기요미즈데라", 120)]), day(3, [item("c1", "구로몬 시장", 90), item("c2", "린쿠 아울렛", 120, "shopping")])],
        sources: [],
        researched: false,
      },
    });
  });
  await page.route("**/api/suggest-day-fill", (r) =>
    r.fulfill({
      json: {
        suggestions: [
          { name: "오사카성 공원", description: "", reason: "", stayMinutes: 90, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, caution: "", cuisine: "" },
          { name: "도톤보리 저녁", description: "", reason: "", stayMinutes: 90, travelMinutesToNext: 0, entryFee: 0, mealCost: 20000, caution: "", cuisine: "현지식" },
        ],
        sources: [],
        searched: true,
      },
    }),
  );
  await page.goto("/");
  const box = page.getByRole("region", { name: "상품 링크로 만들기" });
  await box.getByLabel("상품 링크").fill("https://pkgtour.naver.com/products/ybtour/JKP14657C00-20270104");
  await box.getByRole("button", { name: "읽기" }).click();
  await expect(box).toContainText("판매가 1인 ₩899,000");
  await expect(box).toContainText("1인 원가 예산");
  await box.getByRole("button", { name: "이 상품 기준으로 우리 코스 만들기" }).click();

  const d1 = page.locator("#day-1");
  await expect(d1).toContainText("오사카성 공원", { timeout: 30_000 });
  await expect(d1).not.toContainText("전일 자유일정");
  expect(sent).toMatchObject({ days: 3, mustHave: "오사카성, 기요미즈데라", flightDays: { arrive: "12:00", returnDepart: "20:00" } });
  // 판매가에서 시작 (역계산) — 경쟁 상품으로도 등록
  await expect(page.getByText("예산 사용표 (1인, 2인 1실 기준)")).toBeVisible({ timeout: 30_000 });
});

test("상품 링크: 그대로 가져오기도 링크의 항공 시각으로 첫날·마지막 날을 맞추고, 직접 못 읽은 상품은 경고·날짜별 줄 수", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/import-product", (r) =>
    r.fulfill({ json: { ...imported, readDirect: false, courseText: "제1일 (01/04)\n인천 출발\n간사이 도착\n오사카성\n제2일 (01/05)\n\n제3일 (01/06)\n구로몬 시장\n공항" } }),
  );
  let parsedText = "";
  await page.route("**/api/parse-course", async (r) => {
    parsedText = String((r.request().postDataJSON() as { text: string }).text);
    // 원문 분석 결과에 항공 시각이 없다 (예전엔 첫날이 08:00 출발로 시작했다)
    await r.fulfill({
      json: {
        days: [
          day(1, [item("p1", "인천공항 출발", 0, "flight"), item("p2", "간사이공항 도착", 0, "flight"), item("p3", "오사카성", 90)]),
          day(2, [item("p4", "교토 기요미즈데라", 120)]),
          { ...day(3, [item("p5", "구로몬 시장", 90), item("p6", "간사이공항 출발", 0, "flight"), item("p7", "인천공항 도착", 0, "flight")]), overnightCity: "" },
        ],
        meta: { packageName: "오사카 교토 3일", cities: ["오사카"], noShopping: false, noOption: false, hotelGrade: "", highlights: [], flight: null },
        nights: 2,
        totalDays: 3,
        quote: null,
      },
    });
  });
  await page.route("**/api/suggest-day-fill", (r) => r.fulfill({ json: { suggestions: [], sources: [], searched: false } }));
  await page.goto("/");
  const box = page.getByRole("region", { name: "상품 링크로 만들기" });
  await box.getByLabel("상품 링크").fill("https://pkgtour.naver.com/products/ybtour/JKP14657C00-20270104");
  await box.getByRole("button", { name: "읽기" }).click();
  await expect(box.getByRole("alert").first()).toContainText("직접 읽지 못해");
  await expect(box.getByLabel("날짜별 줄 수")).toContainText("2일 0줄");
  await box.getByRole("button", { name: "이 상품 코스 그대로 가져오기" }).click();

  const d1 = page.locator("#day-1");
  await expect(d1).toContainText("오사카성", { timeout: 30_000 });
  // 링크의 항공 시각(10:00 출발 → 12:00 도착)으로 시작, 08:00 출발이 아니다
  await expect(d1).toContainText("10:00");
  await expect(d1).toContainText("12:00");
  await expect(d1).not.toContainText("08:00");
  await expect(page.locator("#day-3")).toContainText("20:00");
  // 코스 분석에 보낸 원문 앞에 항공 줄이 붙는다
  expect(parsedText).toContain("KE723 인천(ICN) 10:00 출발 → 간사이(KIX) 12:00 도착");
});

test("상품 링크: 날짜 요약 순서로 읽힌 코스(호텔→관광, 귀국편→관광)를 바로잡고, 세부 일정을 못 읽으면 그대로 가져오기를 막는다", async ({ page }) => {
  await mockAi(page);
  const fuk = {
    ...imported, productName: "후쿠오카 2박3일", destination: "후쿠오카", departureDate: "2026-12-09", hotel: "힐튼 후쿠오카 시 호크",
    outbound: { airline: "제주항공", flightNumber: "7C1405", date: "2026-12-09", departAirport: "인천", departTime: "15:20", arriveAirport: "후쿠오카", arriveTime: "16:50" },
    inbound: { airline: "제주항공", flightNumber: "7C1405", date: "2026-12-11", departAirport: "후쿠오카", departTime: "17:50", arriveAirport: "인천", arriveTime: "19:30" },
    courseText: "제1일\n라라포트\n제2일\n야나가와\n제3일\n다자이후", url: "https://pkgtour.naver.com/products/ybtour/JKP14657C00-20261209",
  };
  let detail = false;
  await page.route("**/api/import-product", (r) => r.fulfill({ json: { ...fuk, courseDetail: detail } }));
  const it = (id: string, name: string, type: string, stay = 60) => ({ ...item(id, name, stay, type), ...(type === "meal" ? { mealSlot: name.includes("점심") ? "lunch" : "dinner" } : {}) });
  const d = (n: number, items: ReturnType<typeof it>[], city: string) => ({ ...day(n, items), overnightCity: city });
  await page.route("**/api/parse-course", (r) =>
    r.fulfill({
      json: {
        days: [
          d(1, [it("a1", "인천 출발", "flight", 0), it("a2", "후쿠오카 도착", "flight", 0), it("a3", "저녁 식사 (자유식)", "meal"), it("a4", "힐튼 후쿠오카 시 호크", "hotel", 0), it("a5", "라라포트 후쿠오카", "shopping"), it("a6", "시사이드 모모치", "sightseeing", 40)], "후쿠오카"),
          d(2, [it("b1", "점심 식사 (현지식)", "meal"), it("b2", "저녁 식사 (호텔식)", "meal"), it("b3", "츠에타테 온센 호텔 히젠야", "hotel", 0), it("b4", "야나가와 뱃놀이", "experience"), it("b5", "가마도 지옥", "sightseeing", 40), it("b6", "유후인 민예촌", "sightseeing")], "구마모토"),
          d(3, [it("c1", "점심 식사 (현지식)", "meal"), it("c2", "후쿠오카 출발", "flight", 0), it("c3", "인천 도착", "flight", 0), it("c4", "다자이후 텐만구", "sightseeing"), it("c5", "후쿠오카공항 이동", "transfer", 0)], ""),
        ],
        meta: { packageName: "후쿠오카 2박3일", cities: ["후쿠오카", "구마모토"], noShopping: false, noOption: false, hotelGrade: "", highlights: [], flight: null },
        nights: 2,
        totalDays: 3,
        quote: null,
      },
    }),
  );
  await page.route("**/api/suggest-day-fill", (r) => r.fulfill({ json: { suggestions: [], sources: [], searched: false } }));
  await page.goto("/");
  const box = page.getByRole("region", { name: "상품 링크로 만들기" });
  await box.getByLabel("상품 링크").fill(fuk.url);

  // 세부 일정을 못 읽고 요약만 읽었으면 경고하고 그대로 가져오기를 막는다
  await box.getByRole("button", { name: "읽기" }).click();
  await expect(box).toContainText("세부 일정(1. 2. 3. 순서)을 읽지 못하고");
  await expect(box.getByRole("button", { name: "이 상품 코스 그대로 가져오기" })).toBeDisabled();
  await expect(box).toContainText("오는 편 편명이 가는 편과 같게 읽혀");

  detail = true;
  await box.getByLabel("상품 링크").fill(`${fuk.url}?x=1`);
  await box.getByRole("button", { name: "읽기" }).click();
  await box.getByRole("button", { name: "이 상품 코스 그대로 가져오기" }).click();

  const order = async (sel: string, a: string, b: string) => {
    const text = await page.locator(sel).innerText();
    return text.indexOf(a) >= 0 && text.indexOf(b) >= 0 && text.indexOf(a) < text.indexOf(b);
  };
  await expect(page.locator("#day-3")).toContainText("다자이후 텐만구", { timeout: 30_000 });
  // 1일: 관광 → 저녁 → 숙박 호텔 / 2일: 관광이 호텔보다 먼저 / 3일: 다자이후 → 공항 이동 → 17:50 귀국편
  expect(await order("#day-1", "라라포트 후쿠오카", "저녁 식사 (자유식)")).toBe(true);
  expect(await order("#day-2", "야나가와 뱃놀이", "저녁 식사 (호텔식)")).toBe(true);
  expect(await order("#day-3", "다자이후 텐만구", "후쿠오카 출발")).toBe(true);
  await expect(page.locator("#day-1")).toContainText("15:20");
  await expect(page.locator("#day-3")).toContainText("17:50");
  await expect(page.getByText(/순서 바로잡음/).first()).toBeVisible();
});

test("상품 링크: 2일차 아침이 1일차 숙박 뒤로 들어와도 다음 날로 돌려 첫날 체크인이 밤늦게 되지 않는다", async ({ page }) => {
  await mockAi(page);
  const fuk = {
    ...imported, productName: "후쿠오카 3일 힐튼1박+히젠야료칸1박", destination: "후쿠오카", departureDate: "2026-12-09", courseDetail: true,
    outbound: { airline: "제주항공", flightNumber: "7C1405", date: "2026-12-09", departAirport: "인천", departTime: "15:20", arriveAirport: "후쿠오카", arriveTime: "16:50" },
    inbound: { airline: "제주항공", flightNumber: "7C1406", date: "2026-12-11", departAirport: "후쿠오카", departTime: "17:50", arriveAirport: "인천", arriveTime: "19:30" },
    courseText: "1일차2026.12.09.(수)\n라라포트 후쿠오카\n시사이드 모모치\n2일차2026.12.10.(목)\n야나가와 뱃놀이\n가마도 지옥\n유후인 민예촌\n3일차2026.12.11.(금)\n다자이후 텐만구",
    url: "https://pkgtour.naver.com/products/ybtour/JKP14657C00-20261209",
  };
  await page.route("**/api/import-product", (r) => r.fulfill({ json: fuk }));
  const it = (id: string, name: string, type: string, stay = 60, travel = 30) => ({ ...item(id, name, stay, type), travelMinutesToNext: travel });
  const d = (n: number, items: ReturnType<typeof it>[], city: string) => ({ ...day(n, items), overnightCity: city });
  await page.route("**/api/parse-course", (r) =>
    r.fulfill({
      json: {
        days: [
          d(1, [it("a1", "인천 출발", "flight", 0, 85), it("a2", "후쿠오카 공항 도착", "flight", 0, 15), it("a3", "라라포트 후쿠오카", "shopping", 60, 20), it("a4", "시사이드 모모치", "sightseeing", 40, 20), it("a5", "힐튼 후쿠오카 시 호크", "hotel", 0, 0), it("a6", "호텔 조식 후", "hotel", 0, 90), it("a7", "야나가와 뱃놀이", "experience", 30, 90), it("a8", "가마도 지옥", "sightseeing", 40, 30)], "후쿠오카"),
          d(2, [it("b1", "유후인 민예촌", "sightseeing", 60, 60), it("b2", "츠에타테 히젠야", "hotel", 0, 0)], "구마모토"),
          d(3, [it("c1", "호텔 조식 후", "hotel", 0, 60), it("c2", "다자이후 텐만구", "sightseeing", 60, 40), it("c3", "후쿠오카 공항 출발", "flight", 0, 90), it("c4", "인천 도착", "flight", 0, 0)], ""),
        ],
        meta: { packageName: "후쿠오카 3일", cities: ["후쿠오카", "구마모토"], noShopping: false, noOption: false, hotelGrade: "", highlights: [], flight: null },
        nights: 2,
        totalDays: 3,
        quote: null,
      },
    }),
  );
  await page.route("**/api/suggest-day-fill", (r) => r.fulfill({ json: { suggestions: [], sources: [], searched: false } }));
  await page.goto("/");
  const box = page.getByRole("region", { name: "상품 링크로 만들기" });
  await box.getByLabel("상품 링크").fill(fuk.url);
  await box.getByRole("button", { name: "읽기" }).click();
  await box.getByRole("button", { name: "이 상품 코스 그대로 가져오기" }).click();

  const d1 = page.locator("#day-1");
  await expect(d1).toContainText("시사이드 모모치", { timeout: 30_000 });
  await expect(d1).not.toContainText("야나가와 뱃놀이");
  await expect(d1).not.toContainText("호텔 조식 후");
  await expect(page.locator("#day-2")).toContainText("야나가와 뱃놀이");
  await expect(page.getByText(/날짜 경계 바로잡음/).first()).toBeVisible();
});
