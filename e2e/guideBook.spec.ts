import { expect, test, type Page } from "@playwright/test";
import { DAYS, mockAi } from "./mocks";

// 가이드 해설집 — 지점별 전문 해설 원고(AI 초안 → 사실 확인 → 검수 → 고치기 → 지점 더 깊게), 예전 원고 새 방식으로,
// 영어 원고, 교육 자료, 일정 항목의 "해설 n분"·체류 맞추기, 상품 해설집 인쇄, 도시 교육 자료

const work = { days: DAYS, pmChoice: {}, meta: { packageName: "다낭 3일", cities: ["다낭"], noShopping: true, noOption: true, hotelGrade: "4성급", highlights: [] }, generatedCurrency: "KRW", usps: [], uspKey: null };
const input = { destination: "다낭", days: 3, nights: 2, travelers: 4, departureDate: "2026-11-05", vehicleCostPerDay: 150000, guideCostPerDay: 100000, pricingMode: "target_margin", targetMarginRate: 20, tripScope: "overseas", costStatus: { vehicle: "confirmed", guide: "confirmed" } };

const story = (s: string) => `${s} `.repeat(6).trim();

// AI 대신 쓰는 새 방식 원고 (짧은 방문 · 지점 2곳)
const draft = (city: string, name: string) => ({
  key: name.replace(/\s/g, ""),
  city,
  name,
  area: "시내",
  version: 2,
  tier: "brief",
  intro: "[버스가 멈추기 전에] 분홍색 외벽으로 유명한 다낭 대성당입니다. 프랑스 식민지 시절인 1923년에 지어졌어요.",
  points: [
    {
      title: "정문 앞 — 분홍 외벽",
      hook: "[모두 모이면] 자, 이 성당 색깔부터 보세요. 왜 하필 분홍일까요?",
      look: "[손으로 가리키며] 꼭대기 십자가 위의 수탉 풍향계를 찾아보세요.",
      text: story("프랑스 신부 루이 발레가 1923년에 세운 성당으로, 다낭에 지어진 유일한 프랑스 시대 성당입니다."),
      meaning: "수탉은 베드로의 이야기에서 온 상징으로 깨어 있으라는 뜻입니다.",
      korea: "명동성당이 1898년이니, 그보다 25년 뒤에 지어진 셈이에요.",
      question: "탑 높이는 몇 미터일까요? (약 70미터)",
      transition: "이제 옆쪽 성모상으로 가 볼까요?",
      more: "",
    },
    {
      title: "성모상과 동굴",
      hook: "[목소리를 낮추며] 여기는 지금도 기도하는 곳이라 조용히 봐 주세요.",
      look: "바위로 만든 작은 동굴과 성모상을 보세요.",
      text: story("루르드 성모 동굴을 본뜬 곳으로, 현지 신자들이 매일 기도하러 옵니다."),
      meaning: "성모 신앙이 베트남 가톨릭에서 얼마나 깊은지 보여 줍니다.",
      korea: "",
      question: "",
      transition: "사진을 찍고 10분 뒤 정문 성모상 앞에서 모이겠습니다.",
      more: "",
    },
  ],
  guideNotes: ["탑 높이는 자료마다 70m 안팎으로 조금씩 다름 — '약 70미터'로 말할 것"],
  veteran: "",
  checks: [{ where: "지점 1 이야기", claim: "유일한 프랑스 시대 성당", reason: "근거 없음 — 확인 필요" }],
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

// 예전 방식 원고 (포인트 목록) — 새 방식으로 다시 만들기 대상
const legacy = (city: string, name: string) => ({ key: name.replace(/\s/g, ""), city, name, intro: "한 시장입니다.", points: [{ title: "시장", text: "다낭에서 가장 오래된 시장입니다.", more: "" }], status: "draft" });

const englishDraft = {
  intro: "This is Da Nang Cathedral, famous for its pink walls. It was built in 1923.",
  points: [{ title: "The Pink Church", hook: "[when everyone is here] Look at the color first.", look: "", text: "Locals call it the pink church because the whole building is pink.", meaning: "", korea: "", question: "", transition: "", more: "" }],
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
    const body = r.request().postDataJSON() as { kind: string; city: string; name: string; index?: number };
    const cur = (await (await page.request.get(`/api/guidebook?city=${encodeURIComponent(body.city)}`)).json()) as { kit: { scripts: ReturnType<typeof draft>[] } };
    const mine = cur.kit.scripts.find((x) => x.name === body.name);
    let script = draft(body.city, body.name);
    if (body.kind === "english") script = { ...mine!, en: englishDraft } as typeof script;
    if (body.kind === "deepen") script = { ...mine!, status: "draft", points: mine!.points.map((p, i) => (i === body.index ? { ...p, text: `${p.text} 더 깊은 이야기: 성당 종은 프랑스에서 배로 실어 왔습니다.` } : p)) };
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
  // 같은 개발 서버를 다시 쓸 때를 위해 지난 원고를 지우고, 예전 방식 원고 하나를 넣어 둔다
  await page.request.patch("/api/guidebook", { data: { action: "remove", city: "다낭", key: "다낭대성당" } });
  await page.request.patch("/api/guidebook", { data: { action: "save", city: "다낭", script: legacy("다낭", "한 시장") } });
}

test("가이드 해설집: 지점별 전문 해설 원고 — 초안·사실 확인·검수·고치기·지점 더 깊게·예전 원고 새 방식·영어·교육 자료", async ({ page }) => {
  test.setTimeout(180_000);
  await setup(page);
  await page.getByRole("button", { name: "가이드 해설집", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "가이드 해설집" });
  await expect(dlg.getByRole("combobox", { name: "도시" })).toHaveValue("다낭");
  const list = dlg.getByRole("complementary", { name: "장소 목록" });
  await expect(list).toContainText("이 상품 장소");
  // 예전 방식 원고는 목록에 "예전" — 새 방식으로 다시 만들기
  await expect(list.getByRole("button", { name: /^한 시장/ })).toContainText("예전");
  await list.getByRole("button", { name: /다낭 대성당/ }).click();
  await dlg.getByRole("button", { name: "AI로 초안 만들기" }).click();
  const doc = dlg.getByRole("region", { name: "원고" });
  await expect(doc).toContainText("초안 — 검수 필요");
  // 지점별 해설: 도입·관찰·이야기·의미·한국 비교·질문·연결, 연출 표시
  await expect(doc).toContainText("지점 1정문 앞 — 분홍 외벽");
  await expect(doc).toContainText("자, 이 성당 색깔부터 보세요");
  await expect(doc).toContainText("명동성당이 1898년이니");
  await expect(doc.getByText("[손으로 가리키며]", { exact: true })).toBeVisible();
  // 품질·가이드 노트·사실 확인
  await expect(doc.getByLabel("원고 품질")).toContainText("짧은 방문 · 지점 2곳 · 이야기 2 · 한국 비교 1 · 질문 1");
  await expect(doc.getByLabel("원고 품질")).toContainText("확인 필요 1곳");
  await expect(doc).toContainText("탑 높이는 자료마다 70m 안팎으로 조금씩 다름");
  await expect(doc).toContainText("⚠ 사실 확인 필요 1곳");
  await expect(doc).toContainText(/체류 구성: 대기 0 · 설명 \d+ · 관람 20 · 집결 10 = \d+분/);

  // 고치기: 소개 고치고, 사실 확인 '확인함', 베테랑 메모 → 저장 → 검수
  await doc.getByRole("button", { name: "고치기" }).click();
  await doc.getByRole("textbox", { name: "버스 안 소개 (도착 전 1분)" }).fill("다낭에서 가장 유명한 분홍 성당입니다.");
  await doc.getByRole("button", { name: "확인함" }).click();
  await doc.getByRole("textbox", { name: /베테랑 가이드 메모/ }).fill("오전 10시 전에 가야 역광 없이 사진이 잘 나옵니다.");
  await doc.getByRole("button", { name: "저장" }).click();
  await expect(doc).toContainText("다낭에서 가장 유명한 분홍 성당입니다.");
  await expect(doc).toContainText("🧓 베테랑 가이드 메모");
  await expect(doc).not.toContainText("⚠ 사실 확인 필요");

  // 지점 더 깊게 → 다시 초안
  await doc.getByRole("button", { name: "이 지점 더 깊게" }).first().click();
  await expect(doc).toContainText("성당 종은 프랑스에서 배로 실어 왔습니다.");
  await doc.getByRole("button", { name: "검수 완료" }).click();
  await expect(doc).toContainText("검수 완료");
  await expect(list.getByRole("button", { name: /다낭 대성당/ })).toContainText("검수 완료");

  // 예전 원고 새 방식으로 다시 만들기
  await dlg.getByRole("button", { name: /예전·얕은 원고 새 방식으로 다시 만들기 \(1곳\)/ }).click();
  await expect(dlg.getByRole("status")).toContainText("1곳을 새 방식(지점별 전문 해설)으로 다시 만들었습니다");
  await expect(list.getByRole("button", { name: /^한 시장/ })).not.toContainText("예전");

  // 영어 원고: 한국어 원고를 영어로 → 검수
  await dlg.getByRole("radiogroup", { name: "원고 언어" }).first().getByRole("radio", { name: "English 원고" }).click();
  await list.getByRole("button", { name: /다낭 대성당/ }).click();
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
  const chip = day1.getByRole("button", { name: /해설 \d+분/ }).first();
  await expect(chip).toBeVisible();
  await chip.click();
  const peek = day1.getByRole("region", { name: "다낭 대성당 가이드 원고" });
  await expect(peek).toContainText("다낭에서 가장 유명한 분홍 성당입니다.");
  await expect(peek).toContainText(/원고 기준 체류 \d+분 \(지금 45분\)/);
  await peek.getByRole("button", { name: /체류를 \d+분으로 맞추기/ }).click();
  await expect(peek).not.toContainText("원고 기준 체류");
  // 원고 언어 바꿔 보기 (영어 원고가 있는 곳)
  await peek.getByRole("radio", { name: "English" }).click();
  await expect(peek).toContainText("This is Da Nang Cathedral");
  await peek.getByRole("radio", { name: "한국어" }).click();

  // 상품 가이드 해설집 인쇄 — 지점별 해설·가이드 노트·베테랑 메모
  await page.getByRole("button", { name: "가이드 해설집 인쇄" }).click();
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  if (await confirm.isVisible().catch(() => false)) {
    for (const c of await confirm.getByRole("checkbox").all()) await c.check();
    await confirm.getByRole("button", { name: "인쇄", exact: true }).click();
  }
  const print = page.locator(".print-root");
  await expect(print).toContainText("가이드 해설집");
  await expect(print).toContainText("다낭에서 가장 유명한 분홍 성당입니다.");
  await expect(print).toContainText("지점 1. 정문 앞 — 분홍 외벽");
  await expect(print).toContainText("📝 가이드 노트 (읽지 않음)");
  await expect(print).toContainText("🧓 베테랑 메모: 오전 10시 전에 가야");
  await expect(print).toContainText("노쇼핑 — 쇼핑센터 방문·권유를 하지 않습니다.");
  await expect(print).toContainText("늦는 손님 대응");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  // 영어 원고로 인쇄
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
