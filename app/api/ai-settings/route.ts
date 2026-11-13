/**
 * 앱 안 "AI 키 설정" (관리자만)
 *  GET  /api/ai-settings                         지금 설정 (키는 끝 4자리만) + 업체별 상태
 *  PUT  /api/ai-settings { GEMINI_API_KEY?, GEMINI_BACKUP_API_KEY?, GROQ_API_KEY?, GEMINI_MODEL?, AI_PROVIDERS? }
 *       글자: 바꿈 · null 또는 "": 지움(Cloudflare 변수로 돌아감) · 없음: 그대로
 *  POST /api/ai-settings { action: "test", provider: "gemini" | "groq" | "cloudflare" }  연결 시험
 */
import { z } from "zod";
import { getSession, requireAdmin, workspaceId } from "@/lib/server/access";
import { providerStatus, resetModelCaches, resetProviderStates, tavilySearch } from "@/lib/server/aiProviders";
import { aiSettingsView, saveAiSettings, type AiSettingName } from "@/lib/server/aiSettings";
import { audit } from "@/lib/server/audit";
import { errorResponse } from "@/lib/server/external";
import { modelName, resetGeminiKeyRest, testProvider } from "@/lib/server/gemini";
import { allowAiCall } from "@/lib/server/rateLimit";

const key = z
  .string()
  .trim()
  .transform((v) => v.replace(/^[A-Z_]+\s*=\s*/, "").replace(/^["']+|["']+$/g, "").trim())
  .refine((v) => v === "" || /^[\x21-\x7e]{10,300}$/.test(v), "키 형식이 올바르지 않습니다(공백 없이 10자 이상).");
const model = z.string().trim().refine((v) => v === "" || /^[a-z0-9][a-z0-9.\-]{2,80}$/i.test(v), "모델 이름 형식이 올바르지 않습니다.");
const order = z
  .string()
  .trim()
  .refine((v) => {
    if (v === "") return true;
    const list = v.split(",").map((s) => s.trim());
    return list.length > 0 && list.length <= 4 && new Set(list).size === list.length && list.every((p) => ["gemini", "groq", "openrouter", "cloudflare"].includes(p));
  }, "사용 순서 형식이 올바르지 않습니다.");

const putSchema = z.object({
  GEMINI_API_KEY: key.nullable().optional(),
  GEMINI_BACKUP_API_KEY: key.nullable().optional(),
  GROQ_API_KEY: key.nullable().optional(),
  OPENROUTER_API_KEY: key.nullable().optional(),
  TAVILY_API_KEY: key.nullable().optional(),
  GEMINI_MODEL: model.nullable().optional(),
  AI_PROVIDERS: order.nullable().optional(),
});
const testSchema = z.object({ action: z.literal("test"), provider: z.enum(["gemini", "groq", "openrouter", "cloudflare", "tavily"]) });

async function view() {
  const v = await aiSettingsView();
  return { ...v, effectiveModel: modelName(), status: await providerStatus() };
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return Response.json(await view());
}

export async function PUT(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", 400);
  const session = await getSession(request);
  const by = session?.name || "관리자";
  let changed: AiSettingName[];
  try {
    changed = await saveAiSettings(parsed.data, by);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    return code === "NO_STORE"
      ? errorResponse("NO_STORE", "서버 저장소(KV)와 접속 코드가 있어야 앱에서 키를 저장할 수 있습니다.", 503)
      : errorResponse("INTERNAL", "저장하지 못했습니다.", 500);
  }
  // 새 키로 바로 다시 시도하도록 쉬는 상태·모델 목록을 푼다
  if (changed.length) {
    resetProviderStates();
    resetModelCaches();
    resetGeminiKeyRest();
  }
  await audit(await workspaceId(), session, "AI 설정 변경", changed.join(", "));
  return Response.json(await view());
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const parsed = testSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  if (!(await allowAiCall(request))) return errorResponse("RATE_LIMITED", "요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요.", 429);
  if (parsed.data.provider === "tavily") {
    const t0 = Date.now();
    const r = await tavilySearch("오사카성 입장료", 2);
    return Response.json({ ok: !!r && r.length > 0, ms: Date.now() - t0, message: r === null ? "키가 없거나 검색에 실패했습니다." : r.length ? "연결됨" : "결과가 없습니다.", model: "search" });
  }
  resetModelCaches();
  const result = await testProvider(parsed.data.provider);
  if (result.ok) resetProviderStates();
  return Response.json(result);
}
