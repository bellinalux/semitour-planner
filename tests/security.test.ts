import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as bookingsGet } from "@/app/api/bookings/route";
import { pickComparableCompetitors } from "@/lib/competitors";
import { summarizePerf, type PerfEntry } from "@/lib/perf";
import { loginCookie, workspaceId } from "@/lib/server/access";
import { audit, readAudit } from "@/lib/server/audit";
import type { CompetitorCandidate } from "@/types";

const saved = { code: process.env.APP_ACCESS_CODE, ws: process.env.APP_WORKSPACE_ID };
beforeEach(() => {
  process.env.APP_ACCESS_CODE = "sec-test-code";
  delete process.env.APP_WORKSPACE_ID;
});
afterEach(() => {
  process.env.APP_ACCESS_CODE = saved.code;
  if (saved.ws === undefined) delete process.env.APP_WORKSPACE_ID;
  else process.env.APP_WORKSPACE_ID = saved.ws;
});

describe("관리자 코드 교체", () => {
  it("작업공간을 고정하지 않으면 코드가 바뀔 때 저장 위치도 바뀐다", async () => {
    const before = await workspaceId();
    process.env.APP_ACCESS_CODE = "new-code";
    expect(await workspaceId()).not.toBe(before);
  });
  it("APP_WORKSPACE_ID로 고정하면 코드를 바꿔도 같은 저장 위치", async () => {
    const before = (await workspaceId())!;
    process.env.APP_WORKSPACE_ID = before;
    process.env.APP_ACCESS_CODE = "new-code";
    expect(await workspaceId()).toBe(before);
  });
  it("이상한 값은 무시한다", async () => {
    const derived = await workspaceId();
    process.env.APP_WORKSPACE_ID = "../x";
    expect(await workspaceId()).toBe(derived);
  });
});

describe("열람·변경 기록", () => {
  it("변경은 매번, 같은 사람의 같은 열람은 10분에 한 번", async () => {
    const ws = "audit-ws-1";
    const who = { name: "김세미", role: "staff" as const };
    await audit(ws, who, "예약 목록 열람", "", { view: true });
    await audit(ws, who, "예약 목록 열람", "", { view: true });
    await audit(ws, who, "예약 수정", "한빛산악회");
    await audit(ws, who, "예약 수정", "한빛산악회");
    const list = await readAudit(ws);
    expect(list.filter((a) => a.action === "예약 목록 열람")).toHaveLength(1);
    expect(list.filter((a) => a.action === "예약 수정")).toHaveLength(2);
    expect(list[0]).toMatchObject({ who: "김세미", target: "한빛산악회" });
  });

  it("예약 목록을 열면 누가 열었는지 남는다", async () => {
    const cookie = (await loginCookie(new Request("http://localhost"), "sec-test-code"))!.cookie.split(";")[0];
    await bookingsGet(new Request("http://localhost/api/bookings", { headers: { cookie } }));
    const list = await readAudit((await workspaceId())!);
    expect(list.some((a) => a.action === "예약 목록 열람" && a.who === "관리자")).toBe(true);
  });
});

describe("속도 기록 요약", () => {
  it("코스 만들기·자동 견적 전체·단계별 가운데값", () => {
    const e = (kind: PerfEntry["kind"], totalMs: number, steps: Record<string, number> = {}): PerfEntry => ({ at: "", kind, totalMs, steps, destination: "" });
    const rows = summarizePerf([e("generate", 60_000), e("auto-quote", 30_000, { fees: 25_000, fx: 200 }), e("auto-quote", 40_000, { fees: 35_000 }), e("auto-quote", 50_000, { fees: 45_000 })], { fees: "입장료" });
    expect(rows.find((r) => r.label === "자동 견적 전체")).toMatchObject({ count: 3, medianMs: 40_000, p90Ms: 50_000 });
    expect(rows.find((r) => r.label === "· 입장료")?.medianMs).toBe(35_000);
    expect(rows.some((r) => r.label.includes("fx"))).toBe(false); // 1초 미만 단계는 표에서 뺀다
  });
});

describe("경쟁 상품 고르기", () => {
  it("다른 상품 가운데값의 30%도 안 되는 가격(일일 투어 등)은 뺀다", () => {
    const p = (agency: string, pricePerPerson: number) => ({ agency, pricePerPerson }) as CompetitorCandidate;
    const picked = pickComparableCompetitors([p("모두투어", 1_299_000), p("참좋은", 1_349_000), p("마리트", 750_000), p("일일투어", 39_173), p("가격없음", 0)]);
    expect(picked.map((x) => x.agency)).toEqual(["모두투어", "참좋은", "마리트"]);
  });
});
