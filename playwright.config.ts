import { defineConfig, devices } from "@playwright/test";

/**
 * 실제 브라우저로 처음부터 끝까지 도는 테스트 (npm run test:e2e).
 * AI를 부르는 API는 테스트 안에서 가짜 응답으로 바꿔 끼워, 비용 없이 늘 같은 결과로 화면 흐름만 확인한다.
 * 이 PC에서는 설치된 Edge를, GitHub 자동 검사에서는 내려받은 Chromium을 쓴다.
 */
const PORT = 3031;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...(process.env.CI ? {} : { channel: "msedge" }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1500, height: 900 }, ...(process.env.CI ? {} : { channel: "msedge" }) }, testIgnore: /mobile.spec.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], ...(process.env.CI ? {} : { channel: "msedge" }) }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    // 접속 코드 없이(잠금 꺼짐) 띄운다 — 서버 저장 대신 브라우저 저장으로 동작한다
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { APP_ACCESS_CODE: "", GEMINI_API_KEY: "e2e-not-used" },
  },
});
