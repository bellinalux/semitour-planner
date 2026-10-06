import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as staffPost } from "@/app/api/staff/route";
import { getSession, loginCookie, workspaceId } from "@/lib/server/access";
import { hashStaffCode, listStaff, saveStaff } from "@/lib/server/staff";

const MASTER_CODE = "test-master-code";
const url = "http://localhost/api/auth";
const cookieOf = (setCookie: string) => setCookie.split(";")[0];
const withCookie = (cookie: string, init?: RequestInit) => new Request(url, { ...init, headers: { ...(init?.headers ?? {}), cookie } });

let previous: string | undefined;
beforeAll(async () => {
  previous = process.env.APP_ACCESS_CODE;
  process.env.APP_ACCESS_CODE = MASTER_CODE;
  const ws = (await workspaceId())!;
  await saveStaff(ws, [
    { id: "s-kim", name: "김세미", role: "staff", codeHash: await hashStaffCode(ws, "kim-123456"), active: true, createdAt: "" },
    { id: "s-lee", name: "이퇴사", role: "staff", codeHash: await hashStaffCode(ws, "lee-123456"), active: false, createdAt: "" },
  ]);
});
afterAll(() => {
  process.env.APP_ACCESS_CODE = previous;
});

describe("직원별 로그인", () => {
  it("관리자 코드로 들어오면 관리자", async () => {
    const login = await loginCookie(new Request(url), MASTER_CODE);
    expect(login?.session).toMatchObject({ id: "master", role: "admin" });
    expect(await getSession(withCookie(cookieOf(login!.cookie)))).toMatchObject({ role: "admin" });
  });

  it("개인 코드로 들어오면 그 직원 이름·권한, 마지막 접속 시각이 남는다", async () => {
    const login = await loginCookie(new Request(url), "kim-123456");
    expect(login?.session).toEqual({ id: "s-kim", name: "김세미", role: "staff" });
    expect(await getSession(withCookie(cookieOf(login!.cookie)))).toEqual({ id: "s-kim", name: "김세미", role: "staff" });
    const ws = (await workspaceId())!;
    expect((await listStaff(ws, true)).find((m) => m.id === "s-kim")?.lastLoginAt).toBeTruthy();
  });

  it("틀린 코드·꺼진 계정·위조한 쿠키는 거절", async () => {
    expect(await loginCookie(new Request(url), "nope-nope")).toBeNull();
    expect(await loginCookie(new Request(url), "lee-123456")).toBeNull();
    expect(await getSession(withCookie("sp_access=v2.eyJzaWQiOiJtYXN0ZXIifQ.deadbeef"))).toBeNull();
  });

  it("들어온 뒤 계정을 끄면 다음 요청부터 막힌다", async () => {
    const login = await loginCookie(new Request(url), "kim-123456");
    const ws = (await workspaceId())!;
    const list = await listStaff(ws, true);
    await saveStaff(
      ws,
      list.map((m) => (m.id === "s-kim" ? { ...m, active: false } : m)),
    );
    expect(await getSession(withCookie(cookieOf(login!.cookie)))).toBeNull();
    await saveStaff(ws, list);
  });

  it("직원은 직원 계정을 만들 수 없고, 관리자는 만들 수 있다", async () => {
    const staff = await loginCookie(new Request(url), "kim-123456");
    const body = JSON.stringify({ name: "박신입", role: "staff", code: "park-123456" });
    const denied = await staffPost(withCookie(cookieOf(staff!.cookie), { method: "POST", body, headers: { "Content-Type": "application/json" } }));
    expect(denied!.status).toBe(403);

    const admin = await loginCookie(new Request(url), MASTER_CODE);
    const ok = await staffPost(withCookie(cookieOf(admin!.cookie), { method: "POST", body, headers: { "Content-Type": "application/json" } }));
    expect(ok!.status).toBe(200);
    const dup = await staffPost(withCookie(cookieOf(admin!.cookie), { method: "POST", body, headers: { "Content-Type": "application/json" } }));
    expect(((await dup!.json()) as { error: { message: string } }).error.message).toBe("다른 직원이 이미 쓰는 코드입니다.");
  });
});
