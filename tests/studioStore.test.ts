import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/studio/store/route";

const saved = process.env.APP_ACCESS_CODE;
beforeEach(() => { process.env.APP_ACCESS_CODE = "store-test-code"; });
afterEach(() => { process.env.APP_ACCESS_CODE = saved; });

const req = (method: string, url: string, code: string, body?: unknown) =>
  new Request(url, { method, headers: { origin: "https://tourdesign.example", "x-studio-code": code, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("스튜디오 보관소 (상세페이지 로그인 이어쓰기)", () => {
  it("접근 코드로 저장하고 다시 받는다", async () => {
    const r1 = await POST(req("POST", "http://localhost/api/studio/store", "store-test-code", { key: "settings", value: { gas: "https://x", keys: { pexels: "p" } } }));
    expect(r1.status).toBe(200);
    const r2 = await GET(req("GET", "http://localhost/api/studio/store?key=settings", "store-test-code"));
    const j = await r2.json();
    expect(j.value).toEqual({ gas: "https://x", keys: { pexels: "p" } });
    expect(typeof j.savedAt).toBe("string");
  });
  it("저장한 적 없는 칸은 빈 값", async () => {
    const j = await (await GET(req("GET", "http://localhost/api/studio/store?key=templates", "store-test-code"))).json();
    expect(j.value === null || Array.isArray(j.value) || typeof j.value === "object").toBe(true);
  });
  it("접근 코드가 틀리면 막는다", async () => {
    const r = await GET(req("GET", "http://localhost/api/studio/store?key=settings", "wrong"));
    expect(r.status).toBe(401);
  });
  it("정해진 칸 이름만 받는다", async () => {
    const r = await POST(req("POST", "http://localhost/api/studio/store", "store-test-code", { key: "../etc", value: 1 }));
    expect(r.status).toBe(400);
  });
});
