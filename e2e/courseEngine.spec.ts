import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

const area = (id: string, name: string, a: string | null, stay: number, travel: number) => ({
  id,
  type: "sightseeing",
  admission: "none",
  name,
  description: "",
  stayMinutes: stay,
  travelMinutesToNext: travel,
  entryFee: 0,
  mealCost: 0,
  isEstimated: true,
  ...(a ? { timeCheck: { basis: "area", area: a, checkedAt: "2026-10-09T00:00:00Z" } } : {}),
});

// 첫날: 구역 확인을 마쳤는데도 11시간 넘는 날 / 둘째 날: 자유일정만
const work = {
  days: [
    {
      day: 1,
      theme: "마카오 반도·타이파·콜로안",
      kind: "linear",
      overnightCity: "마카오",
      meetingTime: "09:00",
      amGuided: [],
      pmFreeOptions: [],
      items: [
        area("a1", "탑석광장", "역사지구", 60, 0),
        area("a2", "몬테요새", "역사지구", 60, 0),
        area("a3", "성바울 성당", "역사지구", 60, 0),
        area("a4", "세나도 광장", "역사지구", 60, 20),
        area("b1", "타이파 빌리지", "타이파", 120, 0),
        area("b2", "쿤하 거리", "타이파", 120, 20),
        area("c1", "콜로안 빌리지", null, 150, 0),
      ],
    },
    {
      day: 2,
      theme: "자유 일정",
      kind: "linear",
      overnightCity: "마카오",
      meetingTime: "09:00",
      amGuided: [],
      pmFreeOptions: [],
      items: [{ ...area("f", "자유 일정", null, 600, 0), type: "free_time" }],
    },
  ],
  pmChoice: {},
  meta: null,
  generatedCurrency: "KRW",
  usps: [],
  uspKey: null,
};

/** 받은 장소를 순서대로 흘린 응답 — 처음 채점은 62점, 고친 뒤 다시 채점하면 91점 */
function planResponse(places: { id: string; name: string; stayMin: number }[], score: number) {
  let t = 540;
  const timeline = places.map((p) => {
    const stop = { id: p.id, name: p.name, arrive: t, start: t, end: t + p.stayMin, travelFromPrev: 0, wait: 0, issues: [] };
    t += p.stayMin;
    return stop;
  });
  const result = { order: places.map((p) => p.id), timeline, violations: [], dropped: [], totalTravel: 0, totalWait: 0, endTime: t, savedTravel: 0, method: "exhaustive" };
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : "D";
  const quality = {
    score,
    grade,
    items: [
      { key: "time", label: "시간", score: 30, max: 30, issues: [] },
      { key: "route", label: "동선", score: 25, max: 25, issues: [] },
      { key: "density", label: "밀도", score: score >= 90 ? 15 : 4, max: 15, issues: score >= 90 ? [] : ["하루가 11시간 넘음"] },
      { key: "stamina", label: "체력", score: score >= 90 ? 14 : 3, max: 15, issues: score >= 90 ? [] : ["쉬지 않고 4시간 넘게 이어짐"] },
      { key: "meal", label: "식사", score: score >= 90 ? 7 : 0, max: 15, issues: [] },
    ],
    fixes: [],
  };
  return {
    current: result,
    best: result,
    quality,
    bestQuality: quality,
    places: [],
    context: { weekday: null, holiday: null, sunset: null, sunrise: null, matrix: "estimate", looked: 0, known: places.length },
  };
}

test("코스 엔진: 점수 배지, 날짜 사이 옮기기·휴식을 한 번에 적용하면 자동으로 다시 채점하고 되돌릴 수 있다", async ({ page }) => {
  await mockAi(page);
  let rounds = 0;
  await page.route("**/api/engine/plan", async (r) => {
    const body = r.request().postDataJSON() as { places: { id: string; name: string; stayMin: number }[] };
    rounds++;
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(planResponse(body.places, rounds === 1 ? 62 : 91)) });
  });
  await page.addInitScript((w) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ mode: "paste", destination: "마카오", days: 2, nights: 1, travelers: 4 }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, work);
  await page.goto("/");

  const engine = page.locator("#course-engine");
  // 점검 전에도 날짜 사이 옮기기 제안이 보인다
  await expect(engine.getByText(/DAY 1이 10시간을 넘습니다 — 콜로안 빌리지\(1곳, 2시간 30분\)을 DAY 2로 옮기기/)).toBeVisible();

  await engine.getByRole("button", { name: "점검하기" }).click();
  const day1 = page.locator("#day-1");
  await expect(day1.getByRole("button", { name: "코스 62점 D" })).toBeVisible();
  await expect(engine.getByText("100점 만들기 — 고를 것을 켜고 한 번에 적용")).toBeVisible();
  await expect(engine.getByLabel("쉬지 않고 4시간 넘는 곳에 30분 휴식 넣기")).toBeChecked();

  await engine.getByRole("button", { name: "고른 것 적용하고 다시 채점" }).click();
  // 콜로안은 둘째 날로, 첫날에는 휴식이 들어간다
  await expect(page.locator("#day-2")).toContainText("콜로안 빌리지");
  await expect(day1).not.toContainText("콜로안 빌리지");
  await expect(day1).toContainText("휴식 · 카페");
  // 바뀐 날은 잠시 뒤 자동으로 다시 채점
  await expect(day1.getByRole("button", { name: "코스 91점 A" })).toBeVisible({ timeout: 10_000 });

  await engine.getByRole("button", { name: "되돌리기" }).click();
  await expect(day1).toContainText("콜로안 빌리지");
  await expect(day1).not.toContainText("휴식 · 카페");
});

test("지그재그 동선: 떠났던 구역으로 되돌아오는 날을 알리고, 구역 순서대로 묶고, 되돌릴 수 있다", async ({ page }) => {
  await mockAi(page);
  const zigWork = {
    ...work,
    days: [
      {
        ...work.days[0],
        items: [
          area("a1", "탑석광장", "역사지구", 40, 25),
          area("t1", "타이파 빌리지", "타이파", 60, 25),
          area("a2", "세나도 광장", "역사지구", 40, 0),
        ],
      },
    ],
  };
  await page.addInitScript((w) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ mode: "paste", destination: "마카오", days: 1, nights: 0, travelers: 4 }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, zigWork);
  await page.goto("/");

  const day1 = page.locator("#day-1");
  await expect(day1.getByText(/지그재그 동선 — 타이파 → 역사지구로 되돌아옴/)).toBeVisible();
  await day1.getByRole("button", { name: "구역 순서대로 묶기" }).click();
  await expect(day1.getByText(/지그재그 동선/)).toHaveCount(0);
  const names = await day1.locator("ol > li").allInnerTexts();
  expect(names.findIndex((n) => n.includes("세나도 광장"))).toBeLessThan(names.findIndex((n) => n.includes("타이파 빌리지")));

  await page.locator("#course-engine").getByRole("button", { name: "되돌리기" }).click();
  await expect(day1.getByText(/지그재그 동선/)).toBeVisible();
});

test("동선상 식당: 다른 지역 식당에 갔다가 되돌아오면 알리고, 그 지역 식당으로 바꾼다", async ({ page }) => {
  await mockAi(page);
  await page.route("**/api/suggest-restaurant", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        searched: true,
        sources: [],
        restaurants: [
          { name: "찬 셍 케이", cuisine: "광둥 요리", area: "콜로안 빌리지 광장", walkMinutes: 1, mealCost: 0, groupOk: true, reason: "단체 원형 테이블", sourceName: "미쉐린 가이드" },
        ],
      }),
    }),
  );
  const rg = (id: string, name: string, region: string, type = "sightseeing") => ({
    ...area(id, name, region, 30, 10),
    type,
    timeCheck: { basis: "area", area: region, region, checkedAt: "2026-10-09T00:00:00Z" },
  });
  const mealWork = { ...work, days: [{ ...work.days[0], items: [rg("c1", "콜로안 빌리지", "콜로안"), rg("l", "점심 식사 (딤섬)", "코타이", "meal"), rg("c2", "하비에르 성당", "콜로안")] }] };
  await page.addInitScript((w) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ mode: "paste", destination: "마카오", days: 1, nights: 0, travelers: 8 }));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, mealWork);
  await page.goto("/");

  const day1 = page.locator("#day-1");
  await expect(day1.getByText(/점심 식사 \(딤섬\)이\(가\) 코타이에 있어/)).toBeVisible();
  await day1.getByRole("button", { name: "콜로안 식당 찾기" }).click();
  await day1.getByRole("button", { name: "이 식당으로 바꾸기" }).click();
  await expect(day1.getByText("점심 식사 (찬 셍 케이)")).toBeVisible();
  await expect(day1.getByText(/코타이에 있어/)).toHaveCount(0);
  await expect(day1.getByText(/지그재그 동선/)).toHaveCount(0);
});

test("운영 지시서: 가격 없이 시각표·차량 하차/픽업·식사 예약·운영 경고를 담는다", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  const walk = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    ...area(id, name, "역사지구", 40, 0),
    timeCheck: { basis: "area", area: "역사지구", region: "마카오 반도", checkedAt: "2026-10-09T00:00:00Z", ...extra },
  });
  const opWork = {
    ...work,
    days: [
      {
        ...work.days[0],
        items: [
          walk("a1", "탑석광장", { dropOff: "탑석광장 대로변", pickUp: "세나도 광장 맞은편" }),
          walk("a2", "세나도 광장"),
          { ...area("l", "점심 식사 (딤섬)", "역사지구", 60, 20), type: "meal", cuisine: "딤섬", payment: "local" },
        ],
      },
    ],
  };
  await page.addInitScript((w) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem(
      "semitour-planner:input:v1",
      JSON.stringify({ mode: "paste", destination: "마카오", days: 1, nights: 0, travelers: 6, vehicleCostPerDay: 100000, guideCostPerDay: 80000 }),
    );
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
  }, opWork);
  await page.goto("/");

  await page.getByRole("button", { name: "운영 지시서" }).click();
  const doc = page.locator(".print-root");
  await expect(doc).toContainText("운영 지시서");
  await expect(doc).toContainText("차량 하차: 탑석광장 대로변 → 걸어서 → 픽업: 세나도 광장 맞은편");
  await expect(doc).toContainText("6명 식사 예약 확인 (딤섬)");
  await expect(doc).toContainText("식대 현지 지불(고객 부담)");
  // 가격(원화 금액)은 넣지 않는다
  await expect(doc).not.toContainText("₩");
  await expect(doc).not.toContainText("원가");
});
