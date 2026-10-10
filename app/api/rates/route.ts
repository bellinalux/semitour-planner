import { z } from "zod";
import { isAuthed } from "@/lib/server/access";
import { addGround, addHotel } from "@/lib/rateBook";
import { getRates, listRateCities, updateRates } from "@/lib/server/rateStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/** GET /api/rates — 도시 목록, ?city= — 그 도시 요금표 (직원만) */
export async function GET(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const city = new URL(request.url).searchParams.get("city")?.trim() ?? "";
  if (!city) return Response.json({ cities: await listRateCities() });
  return Response.json({ doc: await getRates(city.slice(0, 60)) });
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("removeHotel"), city: z.string().trim().min(1).max(60), key: z.string().max(100) }),
  z.object({ action: z.literal("removeGround"), city: z.string().trim().min(1).max(60), key: z.string().max(120) }),
  /** 직원이 아는 계약 요금 직접 넣기 (업체 견적가로 기록) */
  z.object({
    action: z.literal("addRate"),
    city: z.string().trim().min(1).max(60),
    kind: z.enum(["hotel", "vehicle", "guide"]),
    name: z.string().trim().min(1).max(100),
    grade: z.string().trim().max(40).default(""),
    amount: z.number().positive().max(1_000_000_000),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    month: z.number().int().min(0).max(12).default(0),
    by: z.string().trim().max(60).default("직접 입력"),
  }),
  /** 요금 기록 하나 지우기 (잘못 들어간 값) */
  z.object({ action: z.literal("removeRate"), city: z.string().trim().min(1).max(60), key: z.string().max(120), at: z.string().max(40) }),
]);

/** 직원이 고치기 — 호텔·차량/가이드·요금 기록 지우기 */
export async function PATCH(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "내용을 확인해 주세요.", 400);
  const a = parsed.data;
  const doc = await updateRates(a.city, (d) => {
    if (a.action === "addRate") {
      const obs = { at: new Date().toISOString(), month: a.month, low: a.amount, high: a.amount, currency: a.currency, source: "supplier" as const, by: a.by || "직접 입력" };
      return a.kind === "hotel" ? addHotel(d, { name: a.name, grade: a.grade }, obs) : addGround(d, a.kind, a.name, obs);
    }
    if (a.action === "removeHotel") return { ...d, hotels: d.hotels.filter((h) => h.key !== a.key) };
    if (a.action === "removeGround") return { ...d, ground: d.ground.filter((g) => g.key !== a.key) };
    return {
      ...d,
      hotels: d.hotels.map((h) => (h.key === a.key ? { ...h, rates: h.rates.filter((r) => r.at !== a.at) } : h)),
      ground: d.ground.map((g) => (g.key === a.key ? { ...g, rates: g.rates.filter((r) => r.at !== a.at) } : g)),
    };
  });
  return Response.json({ doc });
}
