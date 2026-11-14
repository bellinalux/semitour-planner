import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

const LINE = "[관광지] - 라라포트 후쿠오카 · 2022년 4월 25일에 GRAND OPEN한 미츠이쇼핑파크 라라포트 후쿠오카는 일본 최대급 종합 쇼핑몰입니다.\r\n";

test("업체 코스 원문: 1만 자 넘는 글을 붙여넣어도 한 번에 들어가고, 12,000자 제한·커서 위치를 지킨다", async ({ page }) => {
  await mockAi(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("semitour-planner:input:v1", JSON.stringify({ destination: "후쿠오카", mode: "paste", days: 3, nights: 2 }));
  });
  await page.goto("/");
  const ta = page.locator("#courseText");
  await expect(ta).toHaveAttribute("spellcheck", "false");
  await ta.fill("DAY 1\n끝");
  // "DAY 1\n" 뒤에 커서를 두고 붙여넣기
  await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 6));
  const text = LINE.repeat(200); // 약 2만 자 (\r\n 포함)
  const r = await ta.evaluate((el: HTMLTextAreaElement, s: string) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", s);
    const t0 = performance.now();
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return { took: performance.now() - t0, prevented: ev.defaultPrevented };
  }, text);
  expect(r.prevented).toBe(true);
  expect(r.took).toBeLessThan(1000);
  await expect(page.getByText("12,000 / 12,000자")).toBeVisible();
  const v = await ta.inputValue();
  expect(v.startsWith("DAY 1\n[관광지] - 라라포트")).toBe(true);
  expect(v.endsWith("끝")).toBe(true);
  expect(v).not.toContain("\r");
  // 커서는 넣은 글 끝 (뒤에 남은 "끝" 바로 앞)
  await expect.poll(() => ta.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(v.length - 1);

  // 짧은 글은 브라우저 기본 붙여넣기 (되돌리기 가능)
  const short = await ta.evaluate((el: HTMLTextAreaElement) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "짧은 글");
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(short).toBe(false);
});
