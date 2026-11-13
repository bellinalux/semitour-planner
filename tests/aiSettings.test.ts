import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, PUT } from "@/app/api/ai-settings/route";
import { loginCookie, workspaceId } from "@/lib/server/access";
import { resetProviderStates } from "@/lib/server/aiProviders";
import { aiSetting, aiSettingsView, refreshAiSettings } from "@/lib/server/aiSettings";
import { generateJson } from "@/lib/server/gemini";
import { getKv } from "@/lib/server/planStore";
import { hashStaffCode, saveStaff } from "@/lib/server/staff";
import { z } from "zod";

const CODE = "ai-settings-admin-code";
const env = { ...process.env };

async function adminCookie() {
  return (await loginCookie(new Request("http://localhost"), CODE))!.cookie.split(";")[0];
}
const req = (cookie: string, method: string, body?: unknown) =>
  new Request("http://localhost/api/ai-settings", { method, headers: { cookie, "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(async () => {
  process.env.APP_ACCESS_CODE = CODE;
  process.env.APP_WORKSPACE_ID = "aisettingstestws01";
  process.env.GEMINI_API_KEY = "env-gemini-key-0000";
  delete process.env.GROQ_API_KEY;
  resetProviderStates();
  const kv = (await getKv())!.kv;
  await kv.delete(`aisettings:${await workspaceId()}`);
  await refreshAiSettings(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...env };
});

describe("AI 키 설정 (앱 안)", () => {
  it("관리자가 넣은 키는 암호화해 저장하고, 화면에는 끝 4자리만, AI 호출은 그 키를 쓴다", async () => {
    const cookie = await adminCookie();
    const res = await PUT(req(cookie, "PUT", { GEMINI_API_KEY: "  'app-gemini-key-ABCD'  ", GROQ_API_KEY: "gsk_app_groq_key_WXYZ" }));
    expect(res.status).toBe(200);
    const v = (await res.json()) as { settings: Record<string, { source: string; appValue: string }> };
    expect(v.settings.GEMINI_API_KEY).toMatchObject({ source: "app", appValue: "…ABCD" });
    expect(v.settings.GROQ_API_KEY).toMatchObject({ source: "app", appValue: "…WXYZ" });
    expect(JSON.stringify(v)).not.toContain("app-gemini-key");

    // 저장소에는 원문이 없다
    const raw = await (await getKv())!.kv.get(`aisettings:${await workspaceId()}`);
    expect(raw).not.toContain("app-gemini-key");
    expect(raw).not.toContain("gsk_app_groq");

    // AI 호출이 앱 키를 쓴다 (따옴표·공백은 걷어냄)
    const seen: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      seen.push(new Headers(init?.headers).get("x-goog-api-key") ?? "");
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] });
    });
    await generateJson({ system: "s", user: "u", schema: z.object({ a: z.number() }) });
    expect(seen).toEqual(["app-gemini-key-ABCD"]);
  });

  it("앱 키를 지우면 Cloudflare 설정(환경변수)으로 돌아간다", async () => {
    const cookie = await adminCookie();
    await PUT(req(cookie, "PUT", { GEMINI_API_KEY: "app-gemini-key-ABCD" }));
    expect(aiSetting("GEMINI_API_KEY")).toBe("app-gemini-key-ABCD");
    const v = (await (await PUT(req(cookie, "PUT", { GEMINI_API_KEY: null }))).json()) as { settings: Record<string, { source: string }> };
    expect(v.settings.GEMINI_API_KEY.source).toBe("cloudflare");
    expect(aiSetting("GEMINI_API_KEY")).toBe("env-gemini-key-0000");
  });

  it("모델·사용 순서를 바꾸고, 잘못된 값은 거절한다", async () => {
    const cookie = await adminCookie();
    const ok = (await (await PUT(req(cookie, "PUT", { GEMINI_MODEL: "gemini-flash-latest", AI_PROVIDERS: "groq,gemini,cloudflare" }))).json()) as {
      effectiveModel: string;
      status: { order: string[] };
    };
    expect(ok.effectiveModel).toBe("gemini-flash-latest");
    expect(ok.status.order).toEqual(["groq", "gemini", "openrouter", "cloudflare"]);
    expect((await PUT(req(cookie, "PUT", { AI_PROVIDERS: "openai,gemini" }))).status).toBe(400);
    expect((await PUT(req(cookie, "PUT", { GEMINI_API_KEY: "short" }))).status).toBe(400);
    expect((await PUT(req(cookie, "PUT", { GEMINI_MODEL: "../../x" }))).status).toBe(400);
  });

  it("관리자 코드가 바뀌면 저장된 키를 풀지 못했다고 알린다", async () => {
    await PUT(req(await adminCookie(), "PUT", { GROQ_API_KEY: "gsk_app_groq_key_WXYZ" }));
    process.env.APP_ACCESS_CODE = "a-different-admin-code";
    const v = await aiSettingsView();
    expect(v.settings.GROQ_API_KEY).toMatchObject({ broken: true, app: false, source: null });
    expect(aiSetting("GROQ_API_KEY")).toBeNull();
  });

  it("직원·로그인 안 한 사람은 보거나 바꿀 수 없다", async () => {
    const ws = (await workspaceId())!;
    await saveStaff(ws, [{ id: "s-ai", name: "직원", role: "staff", codeHash: await hashStaffCode(ws, "staff-ai-123456"), active: true, createdAt: "" }]);
    const staff = (await loginCookie(new Request("http://localhost"), "staff-ai-123456"))!.cookie.split(";")[0];
    expect((await GET(req(staff, "GET"))).status).toBe(403);
    expect((await PUT(req(staff, "PUT", { GEMINI_API_KEY: "app-gemini-key-ABCD" }))).status).toBe(403);
    expect((await GET(req("", "GET"))).status).toBe(401);
  });

  it("연결 시험: 크레딧 소진이면 알아보기 쉬운 문장으로", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { message: "Your prepayment credits are depleted." } }, { status: 402 }));
    const r = (await (await POST(req(await adminCookie(), "POST", { action: "test", provider: "gemini" }))).json()) as { ok: boolean; message: string };
    expect(r.ok).toBe(false);
    expect(r.message).toContain("크레딧");
  });
});
