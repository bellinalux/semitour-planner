import { errorResponse, ExternalError } from "@/lib/server/external";
import { GeminiError } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { lookupTravelAlert } from "@/lib/server/travelAlert";
import { withAiInfo } from "@/lib/server/aiProviders";

async function handlePost(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const destination = typeof (body as { destination?: unknown })?.destination === "string" ? (body as { destination: string }).destination.trim() : "";
  if (!destination || destination.length > 100) {
    return errorResponse("BAD_REQUEST", "여행지를 입력해 주세요.", 400);
  }

  try {
    return Response.json({ alert: await lookupTravelAlert(destination) });
  } catch (err) {
    if (err instanceof ExternalError || err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[travel-alert]", err);
    return errorResponse("INTERNAL", "여행경보 조회 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}

/** 대체 AI(Groq·Cloudflare)가 답하면 응답 머리글로 화면에 알린다 */
export const POST = withAiInfo(handlePost);
