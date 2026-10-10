import { bookRequestSchema, type Inquiry } from "@/lib/inquiry";
import { readInquiries, writeInquiries } from "@/lib/server/inquiryStore";
import { allowPublicWrite } from "@/lib/server/rateLimit";
import { getShared, newShareId } from "@/lib/server/shareStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * 고객 웹 일정표의 [이 일정으로 예약 요청] (공개 — 링크를 받은 고객). 한 곳에서 1분 5번까지.
 * 회사의 웹 견적 요청함으로 들어가고, 어느 일정표에서 왔는지·고른 선택관광을 함께 남긴다.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getShared(id).catch(() => null);
  if (!it) return errorResponse("NOT_FOUND", "일정표를 찾을 수 없습니다.", 404);
  if (!it.bookable) return errorResponse("NOT_ALLOWED", "이 일정표는 예약 요청을 받지 않습니다.", 403);
  if (!allowPublicWrite(request)) return errorResponse("RATE_LIMITED", "잠시 뒤에 다시 보내 주세요.", 429);
  const parsed = bookRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", 400);
  const b = parsed.data;
  // 일정표에 있는 선택관광만 받는다
  const allowed = new Set(it.options.map((o) => o.name));
  const options = b.options.filter((o) => allowed.has(o));
  const item: Inquiry = {
    id: newShareId(),
    at: new Date().toISOString(),
    done: false,
    name: b.name,
    contact: b.contact,
    destination: it.destination.slice(0, 60),
    departure: "",
    nights: 0,
    travelers: b.travelers,
    budget: 0,
    style: "unsure",
    requests: [`[웹 일정표 예약 요청] ${it.title}`, options.length ? `선택관광: ${options.join(", ")}` : "", b.message].filter(Boolean).join(" · ").slice(0, 500),
    source: { kind: "share", shareId: id, title: it.title.slice(0, 120), period: it.period.slice(0, 80), options },
  };
  if (!(await writeInquiries([item, ...(await readInquiries())]))) return errorResponse("NO_STORE", "지금은 접수할 수 없습니다. 전화로 문의해 주세요.", 503);
  return Response.json({ ok: true });
}
