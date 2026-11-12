import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mockAi } from "./mocks";

const seed = JSON.parse(readFileSync(new URL("./fixtures/printSeed.json", import.meta.url), "utf-8")) as {
  input: Record<string, unknown>;
  work: unknown;
  company: Record<string, unknown>;
};

test("계약서 특약: 여행지(방콕)에 맞는 특약을 추천하고, 위험한 문구는 경고·인쇄 전 확인, 계약서에 특약·동의란·입국 요건이 들어간다", async ({ page }) => {
  await mockAi(page);
  const input = { ...seed.input, destination: "방콕, 태국", tripScope: "overseas", includesFlights: true };
  const company = { ...seed.company, specialTerms: { airCancelFee: 130000, noShowFee: 100000, businessHours: "평일 09:00~18:00", custom: "", disabled: [] } };
  await page.addInitScript(
    (s) => {
      (window as unknown as { print: () => void }).print = () => undefined;
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("semitour-planner:input:v1", JSON.stringify(s.input));
      localStorage.setItem("semitour-planner:work:v1", JSON.stringify(s.work));
      localStorage.setItem("semitour-planner:company:v1", JSON.stringify(s.company));
    },
    { input, work: seed.work, company },
  );
  await page.goto("/");
  await expect(page.locator("#day-1")).toBeVisible();

  // 5. 고객·문서 → 특약
  await page.getByRole("button", { name: /5\. 고객 · 문서/ }).click();
  const panel = page.getByRole("region", { name: "계약서 특약" });
  await expect(panel).toContainText("태국 — 디지털 입국카드(TDAC)");
  await expect(panel.getByRole("checkbox", { name: /항공권 발권 후 취소/ })).toBeChecked();
  await expect(panel).toContainText("TDAC");

  // 위험한 상품 특약을 넣으면 바로 경고
  await panel.getByLabel(/이 상품만의 특약/).fill("현지 사고에 대해 당사는 일체 책임을 지지 않습니다.");
  await expect(panel.getByRole("alert")).toContainText("약관규제법");

  // 계약서 인쇄 전 확인에 특약 경고가 나온다
  await page.getByRole("button", { name: "여행계약서", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "인쇄 전 확인" });
  await expect(confirm).toContainText("특약 — 회사 특약");
  for (const c of await confirm.getByRole("checkbox").all()) await c.check();
  await confirm.getByRole("button", { name: "인쇄", exact: true }).click();

  // 계약서: 특약·표준약관과 다른 점·별도 동의란·입국 요건
  const doc = page.locator(".print-root");
  await expect(doc).toContainText("③ 특약 (표준약관 제6조)");
  await expect(doc).toContainText("항공권 취소 수수료 1인 ₩130,000");
  await expect(doc).toContainText("표준약관과 다른 점");
  await expect(doc).toContainText("이에 동의합니다");
  await expect(doc).toContainText("입국 요건 안내");
  await expect(doc).toContainText("④ 서명");
});
