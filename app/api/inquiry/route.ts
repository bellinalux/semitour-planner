import { ASK_KIND_LABEL, askLine } from "@/lib/serviceRequest";
import { compactDays, SERVICE_LABEL, STYLES } from "@/lib/publicPlan";
import { getPublicSettings, notifyInquiry, recordStats } from "@/lib/server/publicPlan";
import type { DayPlan } from "@/types";
import { z } from "zod";
import { inquirySchema, type Inquiry } from "@/lib/inquiry";
import { isAuthed } from "@/lib/server/access";
import { addInquiry, readInquiries, writeInquiries } from "@/lib/server/inquiryStore";
import { allowPublicWrite } from "@/lib/server/rateLimit";
import { newShareId } from "@/lib/server/shareStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const read = readInquiries;
const write = writeInquiries;

/** 고객 견적 요청 (공개 폼) — 한 곳에서 1분 5번까지 */
export async function POST(request: Request) {
  if (!allowPublicWrite(request)) return errorResponse("RATE_LIMITED", "잠시 뒤에 다시 보내 주세요.", 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", 400);
  const { website: _honeypot, plan, ...data } = parsed.data;
  void _honeypot;
  if ((plan || data.asks) && data.consent !== true) return errorResponse("BAD_REQUEST", "개인정보 수집·이용에 동의해 주세요.", 400);
  const item: Inquiry = {
    ...data,
    id: newShareId(),
    at: new Date().toISOString(),
    done: false,
    ...(plan ? { source: { kind: "plan" as const, title: plan.title, ...(plan.planId ? { planId: plan.planId } : {}) }, planDays: compactDays(plan.days as DayPlan[]), planCities: plan.cities, ...(plan.style ? { planStyle: plan.style } : {}), planServices: plan.services, planTourDays: plan.tourDays } : {}),
  };
  if (!(await addInquiry(item))) return errorResponse("NO_STORE", "지금은 접수할 수 없습니다. 전화로 문의해 주세요.", 503);
  // 고객 코스 통계·새 요청 알림 (실패해도 접수는 그대로)
  if (plan) await recordStats(item.destination, item.planDays ?? [], "requested").catch(() => undefined);
  const settings = await getPublicSettings().catch(() => null);
  if (settings?.notifyEmail) {
    const course = (item.planDays ?? []).map((d) => `DAY ${d.day} ${d.items.filter((i) => !["flight", "hotel", "transfer"].includes(i.type ?? "")).map((i) => i.name).join(" → ")}`).join("\n");
    await notifyInquiry(
      settings.notifyEmail,
      `[${item.asks ? ASK_KIND_LABEL[item.asks.kind] : "견적 요청"}] ${item.name} · ${item.destination} ${item.travelers}명${plan ? " (고객 코스)" : ""}${item.asks ? ` · ${item.asks.items.map((x) => SERVICE_LABEL[x.id]).join("·")}` : ""}`,
      [`이름: ${item.name}`, `연락처: ${item.contact}`, `여행지: ${item.destination}`, `출발: ${item.departure || "미정"} · ${item.nights}박 · ${item.travelers}명`, item.planStyle ? `여행 방식: ${STYLES[item.planStyle].label}${item.planServices?.length ? ` · 맡길 것: ${item.planServices.map((x) => SERVICE_LABEL[x]).join(", ")}` : ""}` : "", item.asks ? `\n${ASK_KIND_LABEL[item.asks.kind]}:\n${item.asks.items.map((x) => `- ${askLine(x)}`).join("\n")}${item.asks.contactHow ? `\n연락: ${item.asks.contactHow}${item.asks.contactWhen ? ` (${item.asks.contactWhen})` : ""}` : ""}` : "", item.requests ? `요청: ${item.requests}` : "", course ? `\n고객이 만든 코스:\n${course}` : "", "\n예약 관리 → 웹 견적 요청에서 확인하세요."].filter(Boolean).join("\n"),
    ).catch(() => false);
  }
  return Response.json({ ok: true });
}

/** 접수된 견적 요청 (직원만) */
export async function GET(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  return Response.json({ inquiries: await read() });
}

/** 처리 완료 표시 (직원만) */
export async function PATCH(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const parsed = z.object({ id: z.string().max(60), done: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  const list = (await read()).map((i) => (i.id === parsed.data.id ? { ...i, done: parsed.data.done } : i));
  await write(list);
  return Response.json({ inquiries: list });
}
