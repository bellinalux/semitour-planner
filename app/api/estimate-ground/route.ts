import { citiesOf } from "@/lib/knowledge";
import { addGround, pickRate } from "@/lib/rateBook";
import { getRates, updateRates } from "@/lib/server/rateStore";
import { groundCostRequestSchema } from "@/lib/schemas/groundCost";
import { GeminiError } from "@/lib/server/gemini";
import { estimateGroundCost } from "@/lib/server/groundCost";
import { guardRequest } from "@/lib/server/guard";
import { cached, DAY } from "@/lib/server/aiCache";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = groundCostRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  try {
    // 차량·가이드 시세는 자주 바뀌지 않으므로 검색 근거가 있는 결과를 7일 동안 다시 쓴다
    const result = await cached("ground-v2", parsed.data, 7 * DAY, () => estimateGroundCost(parsed.data), (r) => r.searched);
    // 회사 요금표에 업체 견적가(6개월 안)가 있으면 차량·가이드는 그 값을 쓰고, 웹 시세는 요금표에 쌓는다
    const city = citiesOf(parsed.data.destination)[0] ?? parsed.data.destination;
    const book = await getRates(city).catch(() => null);
    const supplierPick = (kind: "vehicle" | "guide") => {
      const cards = (book?.ground ?? []).filter((g) => g.kind === kind);
      const picks = cards
        .map((g) => ({ g, p: pickRate(g.rates.filter((r) => r.source === "supplier"), parsed.data.currency, 0) }))
        .filter((x) => x.p !== null)
        .sort((a, b) => b.p!.obs.at.localeCompare(a.p!.obs.at));
      return picks[0] ?? null;
    };
    const v = supplierPick("vehicle");
    const g = supplierPick("guide");
    const out = {
      ...result,
      ...(v ? { vehicleCostPerDay: v.p!.mid, vehicleNote: `회사 요금표 — ${v.g.label} · ${v.p!.basis}` } : {}),
      ...(g ? { guideCostPerDay: g.p!.mid, guideNote: `회사 요금표 — ${g.g.label} · ${g.p!.basis}` } : {}),
      fromBook: Boolean(v || g),
    };
    if (result.searched) {
      const at = new Date().toISOString();
      await updateRates(city, (d) => {
        let doc = d;
        if (result.vehicleCostPerDay > 0)
          doc = addGround(doc, "vehicle", parsed.data.vehicleClass || `${parsed.data.travelers}명 차량`, { at, month: 0, low: result.vehicleCostPerDay, high: result.vehicleCostPerDay, currency: parsed.data.currency, source: "web", by: "웹 시세", note: result.vehicleNote });
        if (result.guideCostPerDay > 0)
          doc = addGround(doc, "guide", parsed.data.tripScope === "domestic" ? "외국어 가이드" : "한국어 가이드", { at, month: 0, low: result.guideCostPerDay, high: result.guideCostPerDay, currency: parsed.data.currency, source: "web", by: "웹 시세", note: result.guideNote });
        return doc;
      });
    }
    return Response.json(out);
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[estimate-ground]", err);
    return errorResponse("INTERNAL", "차량·가이드 요금 추정 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}
