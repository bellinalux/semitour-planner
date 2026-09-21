import { accessRequired } from "@/lib/server/access";
import { readSecret } from "@/lib/server/external";
import { APP_VERSION } from "@/lib/version";

/** Cloudflare의 trace 응답("key=value" 줄들)에서 값을 읽는다 */
function traceValue(text: string, key: string): string | null {
  const line = text.split("\n").find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : null;
}

/**
 * 서버가 외부로 나갈 때 어느 데이터센터(colo)와 국가(loc)로 보이는지 확인한다.
 * Gemini는 이 위치가 지원 지역이어야 하므로, Worker 실행 지역(placement) 설정이 먹었는지 볼 때 쓴다.
 */
async function probeEgress(): Promise<{ colo: string | null; loc: string | null } | { error: string }> {
  try {
    const res = await fetch("https://www.cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(5000) });
    const text = await res.text();
    return { colo: traceValue(text, "colo"), loc: traceValue(text, "loc") };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "probe failed" };
  }
}

/**
 * 배포 상태 확인용. API 키 값은 절대 내보내지 않고, 등록 여부와 이름 형태만 알려준다.
 *  - /api/health          : 키 등록 여부, 버전
 *  - /api/health?probe=1  : 위에 더해 서버의 외부 접속 위치(colo, 국가)
 */
export async function GET(request: Request) {
  const rawKey = process.env.GEMINI_API_KEY;
  const similarNames = Object.keys(process.env).filter((name) => /gemini|google|api_?key/i.test(name));
  const wantsProbe = new URL(request.url).searchParams.get("probe") === "1";

  return Response.json({
    ok: true,
    version: APP_VERSION,
    accessGate: accessRequired() ? "on" : "off",
    geminiKey: rawKey && rawKey.trim() ? "set" : "missing",
    keyLength: rawKey ? rawKey.trim().length : 0,
    // 시세 API 키 등록 여부 (없으면 해당 기능만 안내 문구로 대체된다)
    travelpayoutsToken: readSecret("TRAVELPAYOUTS_TOKEN") ? "set" : "missing",
    viatorKey: readSecret("VIATOR_API_KEY") ? "set" : "missing",
    similarEnvNames: similarNames,
    ...(wantsProbe ? { egress: await probeEgress() } : {}),
  });
}
