/** 고객 코스 저장·불러오기 — POST { title, request, days } → { id } / GET ?id= */
import { z } from "zod";
import { publicPlanRequestSchema } from "@/lib/publicPlan";
import { loadPublicPlan, savePublicPlan } from "@/lib/server/publicPlan";
import { allowPublicWrite } from "@/lib/server/rateLimit";

const schema = z.object({
  title: z.string().trim().min(1).max(80),
  request: publicPlanRequestSchema.omit({ token: true }),
  days: z.array(z.any()).min(1).max(15),
});

export async function POST(request: Request) {
  if (!allowPublicWrite(request)) return Response.json({ error: { code: "RATE_LIMITED", message: "잠시 뒤에 다시 시도해 주세요." } }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "BAD_REQUEST", message: "저장할 코스를 확인해 주세요." } }, { status: 400 });
  try {
    return Response.json({ id: await savePublicPlan(parsed.data) });
  } catch {
    return Response.json({ error: { code: "NO_STORE", message: "지금은 저장할 수 없습니다." } }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const plan = await loadPublicPlan(new URL(request.url).searchParams.get("id") ?? "");
  return plan ? Response.json({ plan }) : Response.json({ error: { code: "NOT_FOUND", message: "코스를 찾지 못했습니다 (180일 뒤 지워집니다)." } }, { status: 404 });
}
