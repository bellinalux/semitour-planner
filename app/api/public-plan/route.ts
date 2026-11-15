/**
 * POST /api/public-plan — 고객용 "내 여행 코스 만들기" (로그인 없이).
 * 사람 확인(Turnstile, 키가 있을 때) → 분당·하루 상한 → 같은 조건 결과 / 지식 창고 + 코스 엔진 / (설정 시) AI.
 */
import { publicPlanRequestSchema } from "@/lib/publicPlan";
import { GeminiError } from "@/lib/server/gemini";
import { cachedPublicPlan, checkQuota, countUse, getPublicSettings, QuotaError, recordStats, verifyHuman } from "@/lib/server/publicPlan";
import { allowPublicWrite } from "@/lib/server/rateLimit";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  if (!allowPublicWrite(request)) return errorResponse("RATE_LIMITED", "잠시 뒤에 다시 시도해 주세요.", 429);
  const parsed = publicPlanRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", 400);
  const req = parsed.data;
  const settings = await getPublicSettings();
  if (!settings.enabled) return errorResponse("DISABLED", "지금은 코스 만들기를 쉬고 있습니다. 견적 요청을 남겨 주세요.", 503);
  if (!(await verifyHuman(req.token, request))) return errorResponse("NOT_HUMAN", "사람 확인을 다시 해 주세요.", 403);
  try {
    // 하루 상한은 새로 만들 때만 확인·계산한다 (같은 조건 재사용은 세지 않음)
    const result = await cachedPublicPlan(req, settings, async () => {
      const quota = await checkQuota(request, settings);
      if (quota) throw new QuotaError(quota);
    });
    if (result.fresh) await countUse(request);
    if (result.fresh) await recordStats(req.cities[0]?.name ?? req.destination, result.days, "made").catch(() => undefined);
    const { fresh: _fresh, ...body } = result;
    void _fresh;
    return Response.json(body);
  } catch (err) {
    if (err instanceof QuotaError) return errorResponse("QUOTA", err.message, 429);
    if (err instanceof Error && err.message === "NO_KNOWLEDGE") return errorResponse("NO_KNOWLEDGE", "이 여행지는 아직 추천 코스를 준비 중입니다. 견적 요청을 남겨 주시면 맞춤 코스를 보내 드립니다.", 404);
    if (err instanceof GeminiError) return errorResponse("AI", "코스를 만드는 중 잠시 문제가 생겼습니다. 조금 뒤에 다시 시도해 주세요.", 502);
    console.error("[public-plan]", err);
    return errorResponse("INTERNAL", "코스를 만들지 못했습니다. 견적 요청을 남겨 주세요.", 500);
  }
}
