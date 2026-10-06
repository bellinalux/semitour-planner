import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DELETE as bookingDelete, PUT as bookingPut } from "@/app/api/bookings/route";
import { DELETE as planDelete, PUT as planPut, GET as planGet } from "@/app/api/plans/route";
import { bookingAlerts, bookingFromQuote, bookingSummary, parseBooking, withHistory, type Booking } from "@/lib/bookings";
import { calculateQuote } from "@/lib/cost";
import { loginCookie, workspaceId } from "@/lib/server/access";
import { hashStaffCode, saveStaff } from "@/lib/server/staff";
import { input, item, linearDay } from "./fixtures";

const base = (patch: Partial<Booking> = {}): Booking => ({
  ...parseBooking({ id: "b-test-0001", customerName: "한빛산악회" })!,
  totalPrice: 1_000_000,
  depositAmount: 100_000,
  status: "contracted",
  ...patch,
});

describe("예약 — 견적에서 초안 만들기", () => {
  it("판매 금액·계약금 10%·잔금 기한(출발 30일 전)을 채운다", () => {
    const i = input({ customerName: "한빛산악회", departureDate: "2026-12-20" });
    const q = calculateQuote(i, [linearDay(1, [item("a", { entryFee: 10000 })])], {});
    if (!q.ok) throw new Error(q.error);
    const d = bookingFromQuote(i, q, new Date(2026, 9, 6));
    expect(d).toMatchObject({ customerName: "한빛산악회", totalPrice: q.scenario.totalPrice, depositAmount: Math.round(q.scenario.totalPrice * 0.1), balanceDue: "2026-11-20", depositDue: "2026-10-09", status: "quoted" });
  });

  it("출발이 30일 안이면 잔금 기한은 출발 3일 전", () => {
    const i = input({ departureDate: "2026-10-20" });
    expect(bookingFromQuote(i, null, new Date(2026, 9, 6)).balanceDue).toBe("2026-10-17");
  });
});

describe("예약 — 알림", () => {
  const today = new Date(2026, 9, 6);
  it("계약금 기한이 지났는데 덜 받았으면 경고", () => {
    expect(bookingAlerts(base({ depositDue: "2026-10-01" }), today)[0]).toEqual({ level: "danger", text: "계약금 기한 5일 지남" });
  });
  it("출발 7일 안인데 미수금이 있으면 경고, 다 받았으면 없음", () => {
    expect(bookingAlerts(base({ departureDate: "2026-10-10", paidAmount: 100_000 }), today).map((a) => a.text)).toContain("출발 D-4 · 미수금 900,000");
    expect(bookingAlerts(base({ departureDate: "2026-10-10", paidAmount: 1_000_000, status: "paid" }), today)).toEqual([]);
  });
  it("취소된 예약은 알리지 않는다", () => {
    expect(bookingAlerts(base({ depositDue: "2026-10-01", status: "cancelled" }), today)).toEqual([]);
  });
  it("받을 돈은 취소·문의를 빼고 통화별로 합친다", () => {
    const s = bookingSummary([base({ paidAmount: 300_000 }), base({ status: "cancelled" }), base({ status: "inquiry" })]);
    expect(s.receivable).toEqual({ KRW: 700_000 });
    expect(s.counts.cancelled).toBe(1);
  });
  it("상태·입금 변경은 이력에 남는다", () => {
    const prev = withHistory(null, base(), "김세미", "2026-10-01T00:00:00Z");
    const next = withHistory(prev, { ...prev, status: "deposit", paidAmount: 100_000 }, "이관리", "2026-10-02T00:00:00Z");
    expect(next.history.map((h) => `${h.by}: ${h.text}`)).toEqual(["이관리: 받은 금액: 0 → 100,000", "이관리: 상태: 계약 → 계약금 입금", "김세미: 예약 등록 (계약)"]);
    expect(next.owner).toBe("김세미");
  });
});

describe("권한 — 예약·저장 일정 삭제는 만든 사람이나 관리자만", () => {
  const MASTER = "test-master-code";
  let previous: string | undefined;
  const req = (cookie: string, method: string, body?: unknown, query = "") =>
    new Request(`http://localhost/api/x${query}`, { method, headers: { cookie, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const cookieOf = (c: string) => c.split(";")[0];

  beforeAll(async () => {
    previous = process.env.APP_ACCESS_CODE;
    process.env.APP_ACCESS_CODE = MASTER;
    const ws = (await workspaceId())!;
    await saveStaff(ws, [
      { id: "s-a", name: "김에이", role: "staff", codeHash: await hashStaffCode(ws, "aaa-123456"), active: true, createdAt: "" },
      { id: "s-b", name: "박비", role: "staff", codeHash: await hashStaffCode(ws, "bbb-123456"), active: true, createdAt: "" },
    ]);
  });
  afterAll(() => {
    process.env.APP_ACCESS_CODE = previous;
  });

  it("예약: 다른 직원은 못 지우고, 만든 사람·관리자는 지운다. 만든 사람은 서버가 정한다", async () => {
    const a = cookieOf((await loginCookie(new Request("http://localhost"), "aaa-123456"))!.cookie);
    const b = cookieOf((await loginCookie(new Request("http://localhost"), "bbb-123456"))!.cookie);
    const saved = (await (await bookingPut(req(a, "PUT", { booking: { ...base(), id: "b-perm-0001", owner: "가짜" } })))!.json()) as { booking: Booking };
    expect(saved.booking.owner).toBe("김에이");
    expect((await bookingDelete(req(b, "DELETE", undefined, "?id=b-perm-0001")))!.status).toBe(403);
    expect((await bookingDelete(req(a, "DELETE", undefined, "?id=b-perm-0001")))!.status).toBe(200);
  });

  it("저장 일정: 작성자가 남고, 다른 직원에게는 삭제 불가로 보인다", async () => {
    const a = cookieOf((await loginCookie(new Request("http://localhost"), "aaa-123456"))!.cookie);
    const b = cookieOf((await loginCookie(new Request("http://localhost"), "bbb-123456"))!.cookie);
    const snapshot = { input: input(), days: [], pmChoice: {}, meta: null, generatedCurrency: null, usps: [], uspKey: null };
    expect((await planPut(req(a, "PUT", { id: "plan-perm-01", name: "다낭", snapshot })))!.status).toBe(200);
    const list = (await (await planGet(req(b, "GET")))!.json()) as { plans: { id: string; author?: string; canDelete?: boolean }[] };
    expect(list.plans.find((p) => p.id === "plan-perm-01")).toMatchObject({ author: "김에이", canDelete: false });
    expect((await planDelete(req(b, "DELETE", undefined, "?id=plan-perm-01")))!.status).toBe(403);
    expect((await planDelete(req(a, "DELETE", undefined, "?id=plan-perm-01")))!.status).toBe(200);
  });
});
