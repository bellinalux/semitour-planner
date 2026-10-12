import { expect, test, type Page } from "@playwright/test";
import { DAYS, mockAi } from "./mocks";

// 가이드 해설집 — 장소 원고(AI 초안 → 검수 → 고치기), 교육 자료, 일정 항목의 "해설 n분"·체류 맞추기, 상품 해설집 인쇄

const work = { days: DAYS, pmChoice: {}, meta: { packageName: "다낭 3일", cities: ["다낭"], noShopping: true, noOption: true, hotelGrade: "4성급", highlights: [] }, generatedCurrency: "KRW", usps: [], uspKey: null };
const input = { destination: "다낭", days: 3, nights: 2, travelers: 4, departureDate: "2026-11-05", vehicleCostPerDay: 150000, guideCostPerDay: 100000, pricingMode: "target_margin", targetMarginRate: 20, tripScope: "overseas", costStatus: { vehicle: "confirmed", guide: "confirmed" } };

// AI 대신 쓰는 원고 초안 (소개 50자 + 포인트 2개 → 기본 설명 약 2분)
const draft = (city: string, name: string) => ({
  key: name.replace(/\s/g, ""),
  city,
  name,
  area: "시내",
  intro: "분홍색 외벽으로 유명한 다낭 대성당입니다. 프랑스 식민지 시절인 1923년에 지어졌어요.",
  points: [
    { title: "분홍 성당이라는 별명", text: "외벽 전체가 분홍색이라 현지에서는 분홍 성당이라고 부릅니다. 꼭대기에는 수탉 모양 풍향계가 있어 수탉 성당이라고도 해요.", more: "" },
    { title: "미사 시간", text: "지금도 미사가 열리는 성당이라 미사 중에는 안쪽 관람을 할 수 없습니다. 조용히 둘러봐 주세요.", more: "" },
  ],
  site: { dropOff: "성당 정문 앞 도로", tickets: "무료", meetPoint: "정문 성모상 앞", restroom: "", photo: "길 건너 맞은편" },
  cautions: ["민소매·짧은 반바지는 안쪽 입장이 어려울 수 있습니다"],
  faq: [{ q: "안에 들어갈 수 있나요?", a: "미사 시간이 아니면 들어갈 수 있습니다." }],
  audience: { family: "", senior: "", student: "", couple: "분홍 외벽 앞 사진" },
  viewMin: 20,
  waitMin: 0,
  mustKnow: ["1923년 완공", "수탉 풍향계"],
  sources: [],
  status: "draft",
  updatedAt: "",
  updatedBy: "",
});

const englishDraft = {
  intro: "This is Da Nang Cathedral, famous for its pink walls. It was built in 1923.",
  points: [{ title: "The Pink Church", text: "Locals call it the pink church because the whole building is pink. There is a rooster weather vane on top, so it is also called the rooster church.", more: "" }],
  site: { dropOff: "", tickets: "Free", meetPoint: "In front of the Virgin Mary statue", restroom: "", photo: "" },
  cautions: ["Shoulders and knees should be covered inside"],
  faq: [],
  audience: { family: "", senior: "", student: "", couple: "" },
  mustKnow: ["Built in 1923"],
  status: "draft",
  updatedAt: "",
  updatedBy: "",
};

async function setup(page: Page) {
  await mockAi(page);
  // 원고 초안: AI 대신 정해진 원고를 서버(개발용 메모리 저장소)에 저장하고 그 결과를 돌려준다
  await page.route("**/api/guidebook/draft", async (r) => {
    const body = r.request().postDataJSON() as { kind: string; city: string; name: string };
    let script = draft(body.city, body.name);
    if (body.kind === "english") {
      // 영어 원고: 지금 저장된 한국어 원고에 영어를 붙인다
      const cur = (await (await page.request.get(`/api/guidebook?city=${encodeURIComponent(body.city)}`)).json()) as { kit: { scripts: (typeof script)[] } };
      script = { ...cur.kit.scripts.find((x) => x.name === body.name)!, en: englishDraft } as typeof script;
    }
    const res = await page.request.patch("/api/guidebook", { data: { action: "save", city: body.city, script } });
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ ...(await res.json()), searched: true }) });
  });
  await page.addInitScript(
    ([w, i]) => {
      window.print = () => undefined;
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("semitour-planner:input:v1", JSON.stringify(i));
      localStorage.setItem("semitour-planner:work:v1", JSON.stringify(w));
    },
    [work, input] as const,
  );
  await page.goto("/");
  // 같은 개발 서버를 다시 쓸 때를 위해 지난 원고를 지운다
  await page.request.patch("/api/guidebook", { data: { action: "remove", city: "다낭", key: "다낭대성당" } });
}

test("가이드 해설집: 이 상품 장소 원고를 AI 초안으로 만들고, 검수·고치기, 교육 자료", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "가이드 해설집", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "가이드 해설집" });
  await expect(dlg.getByRole("combobox", { name: "도시" })).toHaveValue("다낭");
  const list = dlg.getByRole("complementary", { name: "장소 목록" });
  await expect(list).toContainText("이 상품 장소");
  await list.getByRole("button", { name: /다낭 대성당/ }).click();
  await dlg.getByRole("button", { name: "AI로 초안 만들기" }).click();
  const doc = dlg.getByRole("region", { name: "원고" });
  await expect(doc).toContainText("초안 — 검수 필요");
  await expect(doc).toContainText("분홍색 외벽으로 유명한 다낭 대성당입니다");
  // 길이별 말하는 시간, 체류 구성 (대기 0 + 설명 + 관람 20 + 집결 10)
  await expect(doc.getByRole("radiogroup", { name: "원고 길이" })).toContainText("기본 1분");
  await expect(doc).toContainText("체류 구성: 대기 0 · 설명 1 · 관람 20 · 집결 10 = 35분");

  await doc.getByRole("button", { name: "검수 완료" }).click();
  await expect(doc).toContainText("검수 완료");
  await expect(list.getByRole("button", { name: /다낭 대성당/ })).toContainText("검수 완료");

  // 고치기 → 저장
  await doc.getByRole("button", { name: "고치기" }).click();
  await doc.getByRole("textbox", { name: "한 줄 소개 (버스에서 30초)" }).fill("다낭에서 가장 유명한 분홍 성당입니다.");
  await doc.getByRole("button", { name: "저장" }).click();
  await expect(doc).toContainText("다낭에서 가장 유명한 분홍 성당입니다.");

  // 영어 원고: 한국어 원고를 영어로 → 검수
  await dlg.getByRole("radiogroup", { name: "원고 언어" }).first().getByRole("radio", { name: "English 원고" }).click();
  await expect(doc).toContainText("다낭 대성당 — 영어 원고가 없습니다");
  await doc.getByRole("button", { name: "AI로 영어 원고 만들기" }).click();
  await expect(doc).toContainText("English · 초안 — 검수 필요");
  await expect(doc).toContainText("This is Da Nang Cathedral, famous for its pink walls.");
  await doc.getByRole("button", { name: "검수 완료" }).click();
  await expect(doc).toContainText("English · 검수 완료");
  await expect(list.getByRole("button", { name: /다낭 대성당/ })).toContainText("EN");
  await dlg.getByRole("radiogroup", { name: "원고 언어" }).first().getByRole("radio", { name: "한국어 원고" }).click();
  await expect(doc).toContainText("다낭에서 가장 유명한 분홍 성당입니다.");

  // 교육 자료
  await dlg.getByRole("tab", { name: "진행 멘트·기본기·비상 대응" }).click();
  await expect(dlg).toContainText("공항 미팅 인사");
  await expect(dlg).toContainText("분실 (여권·지갑·휴대폰)");
  await dlg.getByRole("button", { name: "닫기" }).click();

  // 일정 항목: "해설 n분" → 원고·체류 맞추기
  const day1 = page.locator("#day-1");
  const chip = day1.getByRole("button", { name: /해설 \d+분/ });
  await expect(chip).toBeVisible();
  await chip.click();
  const peek = day1.getByRole("region", { name: "다낭 대성당 가이드 원고" });
  await expect(peek).toContainText("다낭에서 가장 유명한 분홍 성당입니다.");
  await expect(peek).toContainText("원고 기준 체류 35분 (지금 45분)");
  await peek.getByRole("button", { name: "체류를 35분으로 맞추기" }).click();
  // 원고 언어 바꿔 보기 (영어 원고가 있는 곳)
  await peek.getByRole("radio", { name: "English" }).click();
  await expect(peek).toContainText("This is Da Nang Cathedral");
  await peek.getByRole("radio", { name: "한국어" }).click();
  // 맞추면 안내가 사라지고 일정 시각도 다시 계산된다 (08:00 + 35분 → 10분 단위 08:40)
  await expect(peek).not.toContainText("원고 기준 체류");
  await expect(day1.getByText("08:00 – 08:40")).toBeVisible();

  // 상품 가이드 해설집 인쇄
  await page.getByRole("button", { name: "가이드 해설집 인쇄" }).click();
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  if (await confirm.isVisible().catch(() => false)) {
    for (const c of await confirm.getByRole("checkbox").all()) await c.check();
    await confirm.getByRole("button", { name: "인쇄", exact: true }).click();
  }
  const print = page.locator(".print-root");
  await expect(print).toContainText("가이드 해설집");
  await expect(print).toContainText("다낭에서 가장 유명한 분홍 성당입니다.");
  await expect(print).toContainText("한 시장 — 원고 없음");
  await expect(print).toContainText("노쇼핑 — 쇼핑센터 방문·권유를 하지 않습니다.");
  await expect(print).toContainText("늦는 손님 대응");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  // 영어 원고로 인쇄 (원고 없는 곳은 한국어로 두고 표시)
  await page.getByRole("combobox", { name: "가이드 해설집 원고 언어" }).selectOption("en");
  await page.getByRole("button", { name: "가이드 해설집 인쇄" }).click();
  if (await confirm.isVisible().catch(() => false)) {
    for (const c of await confirm.getByRole("checkbox").all()) await c.check();
    await confirm.getByRole("button", { name: "인쇄", exact: true }).click();
  }
  await expect(print).toContainText("가이드 해설집 (English)");
  await expect(print).toContainText("This is Da Nang Cathedral, famous for its pink walls.");

  // 도시 교육 자료 (신입 교육 교재) — 그 도시 원고 전체 + 교육 자료
  await page.goto("/gb?city=%EB%8B%A4%EB%82%AD");
  await expect(page.getByRole("heading", { name: "다낭 가이드 교육 자료" })).toBeVisible();
  await expect(page.locator("main")).toContainText("검수 완료 1곳");
  await expect(page.locator("main")).toContainText("다낭에서 가장 유명한 분홍 성당입니다.");
  await expect(page.locator("main")).toContainText("공항 미팅 인사");
});
