import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/route";
import { GET as studioCheck } from "@/app/api/studio/gemini/route";
import { GET as storeGet } from "@/app/api/studio/store/route";
import { accessCodeWeak, workspaceInfo } from "@/lib/server/access";
import { FAILS_PER_MINUTE } from "@/lib/server/authThrottle";

const CODE = "throttle-test-code-123";
const saved = process.env.APP_ACCESS_CODE;
beforeEach(() => {
  process.env.APP_ACCESS_CODE = CODE;
});
afterEach(() => {
  if (saved === undefined) delete process.env.APP_ACCESS_CODE;
  else process.env.APP_ACCESS_CODE = saved;
});

const studio = (ip: string, code: string) =>
  new Request("http://localhost/api/studio/gemini", { headers: { origin: "https://evil.example", "x-studio-code": code, "cf-connecting-ip": ip } });
const loginReq = (ip: string, code: string) =>
  new Request("http://localhost/api/auth", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ code }) });

describe("접근 코드 무차별 대입 방지", () => {
  it("스튜디오 연결 확인: 틀린 코드가 잦으면 그 IP는 맞는 코드여도 맞는지 알려 주지 않는다", async () => {
    const ip = "198.51.100.1";
    for (let i = 0; i < FAILS_PER_MINUTE; i++) {
      const r = (await (await studioCheck(studio(ip, `guess-${i}`))).json()) as { codeOk: boolean };
      expect(r.codeOk).toBe(false);
    }
    await studioCheck(studio(ip, "guess-last")); // 한도를 넘어 잠긴다
    const blocked = await studioCheck(studio(ip, CODE));
    expect(blocked.status).toBe(429);
    expect(JSON.stringify(await blocked.json())).not.toContain("codeOk");
    // 잠긴 IP는 다른 스튜디오 주소(보관소)도 막힌다
    const store = await storeGet(new Request("http://localhost/api/studio/store?key=settings", { headers: { origin: "https://evil.example", "x-studio-code": CODE, "cf-connecting-ip": ip } }));
    expect(store.status).toBe(429);
    // 다른 서버 인스턴스(메모리 잠금 없음)에서도 KV에 남긴 잠금으로 막힌다
    (globalThis as unknown as { __semitourAuthLocks?: Map<string, number> }).__semitourAuthLocks?.clear();
    expect((await studioCheck(studio(ip, CODE))).status).toBe(429);
    // 다른 IP는 영향 없다
    const other = (await (await studioCheck(studio("198.51.100.2", CODE))).json()) as { codeOk: boolean };
    expect(other.codeOk).toBe(true);
  });

  it("로그인: 틀린 코드가 잦으면 맞는 코드로도 로그인 쿠키를 주지 않는다 (스튜디오와 같은 잠금)", async () => {
    const ip = "198.51.100.3";
    // 로그인은 인스턴스 안 제한(1분 6회)도 있으므로 스튜디오 쪽으로 실패를 쌓는다 — 잠금은 함께 쓴다
    for (let i = 0; i <= FAILS_PER_MINUTE; i++) await studioCheck(studio(ip, `guess-${i}`));
    const r = await login(loginReq(ip, CODE));
    expect(r.status).toBe(429);
    expect(r.headers.get("set-cookie")).toBeNull();
    // 다른 IP에서는 정상 로그인
    const ok = await login(loginReq("198.51.100.4", CODE));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("sp_access=");
  });

  it("코드 없이 온 연결 확인은 시도로 세지 않는다", async () => {
    const ip = "198.51.100.5";
    for (let i = 0; i < FAILS_PER_MINUTE * 3; i++) await studioCheck(studio(ip, ""));
    const r = (await (await studioCheck(studio(ip, CODE))).json()) as { codeOk: boolean };
    expect(r.codeOk).toBe(true);
  });

  it("관리자 코드가 12자보다 짧으면 약하다고 알린다", async () => {
    expect(accessCodeWeak()).toBe(false);
    process.env.APP_ACCESS_CODE = "short1";
    expect(accessCodeWeak()).toBe(true);
    expect((await workspaceInfo())?.weakCode).toBe(true);
  });
});
