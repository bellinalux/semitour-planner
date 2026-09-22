import { isAuthed } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/external";
import { krwPerUnit } from "@/lib/server/fx";

const CODES = new Set(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]);

/** GET /api/fx?code=THB → 1 THB가 몇 원인지 (AI를 쓰지 않는 조회라 호출 횟수 제한은 두지 않고 접근 코드만 확인한다) */
export async function GET(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
  if (!CODES.has(code)) return errorResponse("BAD_REQUEST", "지원하지 않는 통화입니다.", 400);
  try {
    const found = await krwPerUnit(code);
    if (!found) return errorResponse("UPSTREAM", "환율을 가져오지 못했습니다. 잠시 후 다시 시도하거나 직접 입력해 주세요.", 502);
    return Response.json({ code, krwPerUnit: found.rate, updatedAt: found.updatedAt, source: "open.er-api.com" });
  } catch (err) {
    console.error("[fx]", err);
    return errorResponse("INTERNAL", "환율 조회 중 오류가 발생했습니다.", 500);
  }
}
