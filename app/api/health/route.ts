import { accessCodeWeak, accessRequired, getSession } from "@/lib/server/access";
import { readSecret } from "@/lib/server/external";
import { getKv } from "@/lib/server/planStore";
import { providerStatus } from "@/lib/server/aiProviders";
import { aiSetting, refreshAiSettings } from "@/lib/server/aiSettings";
import { modelName } from "@/lib/server/gemini";
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
 * 배포 상태 확인용. API 키 값은 절대 내보내지 않는다.
 *  - 누구나: { ok, version } 만 (살아 있는지 확인용)
 *  - 관리자로 로그인했거나 잠금이 꺼진 로컬: 키 등록 여부, 비슷한 환경변수 이름, 저장소 상태 등 자세한 내용
 *  - /api/health?probe=1 (관리자): 위에 더해 서버의 외부 접속 위치(colo, 국가)
 * 자세한 내용은 공격자에게 설정 단서가 되므로 로그인 없이는 보여 주지 않는다.
 */
export async function GET(request: Request) {
  const session = await getSession(request);
  if (session?.role !== "admin") return Response.json({ ok: true, version: APP_VERSION });

  await refreshAiSettings();
  const rawKey = aiSetting("GEMINI_API_KEY");
  const similarNames = Object.keys(process.env).filter((name) => /gemini|google|api_?key/i.test(name));
  const wantsProbe = new URL(request.url).searchParams.get("probe") === "1";

  return Response.json({
    ok: true,
    version: APP_VERSION,
    accessGate: accessRequired() ? "on" : "off",
    // 관리자 코드가 권장 길이(12자)보다 짧으면 "weak" — 다른 사이트에서도 확인할 수 있는 코드라 길게 쓴다
    accessCode: accessCodeWeak() ? "weak" : "ok",
    geminiKey: rawKey && rawKey.trim() ? "set" : "missing",
    keyLength: rawKey ? rawKey.trim().length : 0,
    geminiModel: modelName(),
    // AI 업체 순서·키 등록·최근 한도 걸림 (쿨다운은 이 서버 인스턴스 기준)
    aiProviders: await providerStatus(),
    // 시세 API 키 등록 여부 (없으면 해당 기능만 안내 문구로 대체된다)
    travelpayoutsToken: readSecret("TRAVELPAYOUTS_TOKEN") ? "set" : "missing",
    viatorKey: readSecret("VIATOR_API_KEY") ? "set" : "missing",
    dataGoKrKey: readSecret("DATA_GO_KR_KEY") ? "set" : "missing",
    similarEnvNames: similarNames,
    // 서버 저장: 접속 코드가 켜져 있고 저장소(KV)가 연결돼야 쓸 수 있다
    cloudSave: !accessRequired() ? "needs-access-code" : (await getKv())?.kind ?? "no-storage",
    ...(wantsProbe ? { egress: await probeEgress() } : {}),
  });
}
