import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { mockAi } from "./mocks";
import { pdfPages } from "./pdfPages";

// 모든 인쇄 문서를 실제 PDF로 뽑아 쪽마다 확인한다 — 빈 쪽, 제목·꼬리말만 있는 쪽이 없어야 한다.
// 쪽 아래 꼬리말(회사·쪽 번호)은 모든 쪽에 찍히므로, 본문을 숨기고 한 번 더 뽑아 꼬리말 몫을 빼고 센다.

const seed = JSON.parse(readFileSync(new URL("./fixtures/printSeed.json", import.meta.url), "utf-8")) as Record<string, unknown>;

const DOCS: [kind: string, button: string][] = [
  ["itinerary", "여행일정표"],
  ["quote", "견적서"],
  ["invoice", "청구서"],
  ["contract", "여행계약서"],
  ["internal", "원가·마진 검토서"],
  ["operation", "운영 지시서"],
  ["pitch", "상품 소개서"],
  ["options", "비교 견적서 (A/B/C안·인원별)"],
  ["english", "영문 일정표·견적서 (English)"],
  ["packing", "준비물 체크리스트 인쇄"],
];

/** 꼬리말을 뺀 본문 글자 명령이 이보다 적으면 "거의 빈 쪽" (제목 한 줄·표 머리만 남은 쪽) */
const MIN_BODY_TEXT_OPS = 20;

async function printToPdf(page: Page, button: string) {
  const before = await page.evaluate(() => (window as unknown as { __printed?: number }).__printed ?? 0);
  await page.emulateMedia({ media: "screen" });
  const btn = page.getByRole("button", { name: button, exact: true });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  if (await confirm.isVisible().catch(() => false)) {
    for (const c of await confirm.getByRole("checkbox").all()) await c.check();
    await confirm.getByRole("button", { name: "인쇄", exact: true }).click();
  }
  // 앱이 인쇄를 부르는 때 = 문서·지도 그림이 다 준비된 때
  await page.waitForFunction((b) => ((window as unknown as { __printed?: number }).__printed ?? 0) > b, before, { timeout: 60_000 });
  await expect(page.locator(".print-root [data-print-pending]")).toHaveCount(0);

  await page.evaluate(() => ((window as unknown as { __holdPrint?: boolean }).__holdPrint = true));
  await page.emulateMedia({ media: "print" });
  const pdf = (opts = {}) => page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, ...opts });
  const full = pdfPages(await pdf());
  // 같은 쪽 나눔 그대로 본문만 숨겨(visibility) 꼬리말만 남긴 PDF
  const hide = await page.addStyleTag({ content: ".print-root * { visibility: hidden !important; }" });
  const footerOnly = pdfPages(await pdf());
  await hide.evaluate((el) => (el as Element).remove());
  await page.evaluate(() => {
    (window as unknown as { __holdPrint?: boolean }).__holdPrint = false;
    window.dispatchEvent(new Event("afterprint"));
  });
  await expect(page.locator(".print-root")).toHaveCount(0);
  return { full, footerOnly };
}

test("인쇄 문서 10종: 빈 쪽·제목만 있는 쪽 없이 PDF로 나온다", async ({ page }) => {
  test.setTimeout(300_000);
  await mockAi(page);
  // 영문 문서 번역은 원문 그대로 돌려준다
  await page.route("**/api/translate-doc", async (r) => {
    const { texts } = r.request().postDataJSON() as { texts: string[] };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ translations: texts }) });
  });
  await page.addInitScript((s) => {
    const w = window as unknown as { __printed?: number; print: () => void };
    w.print = () => {
      w.__printed = (w.__printed ?? 0) + 1;
    };
    // page.pdf()도 afterprint를 보내 문서가 닫힌다 — 두 번 뽑는 동안은 막고, 다 뽑은 뒤 직접 보낸다
    window.addEventListener("afterprint", (e) => {
      if ((window as unknown as { __holdPrint?: boolean }).__holdPrint) e.stopImmediatePropagation();
    });
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify(s.input));
    localStorage.setItem("semitour-planner:work:v1", JSON.stringify(s.work));
    localStorage.setItem("semitour-planner:company:v1", JSON.stringify(s.company));
    localStorage.setItem("semitour-planner:shareLinks", JSON.stringify(s.shareLinks));
  }, seed);
  await page.goto("/");
  await expect(page.locator("#day-1")).toBeVisible();

  const report: string[] = [];
  const problems: string[] = [];
  for (const [kind, button] of DOCS) {
    const { full, footerOnly } = await printToPdf(page, button);
    expect(footerOnly.length, `${kind}: 본문을 숨겨도 쪽 수가 같아야 한다`).toBe(full.length);
    const body = full.map((p, i) => ({ text: p.textOps - (footerOnly[i]?.textOps ?? 0), images: p.images - (footerOnly[i]?.images ?? 0) }));
    report.push(`${kind} ${full.length}쪽: ${body.map((b) => `${b.text}${b.images ? `+그림${b.images}` : ""}`).join(" · ")}`);
    body.forEach((b, i) => {
      if (b.text < MIN_BODY_TEXT_OPS && b.images === 0) problems.push(`${kind} ${i + 1}/${full.length}쪽 — 본문 글자 ${b.text}`);
    });
  }
  console.log(report.join("\n"));
  expect(problems, "빈 쪽·제목만 있는 쪽").toEqual([]);
});
