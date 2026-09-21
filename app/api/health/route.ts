import { APP_VERSION } from "@/lib/version";

/**
 * 배포 상태 확인용. API 키 값은 절대 내보내지 않고, 등록 여부와 이름 형태만 알려준다.
 * (Cloudflare에 키를 등록했는데 인식되지 않을 때 이름 오타 등을 찾는 데 쓴다)
 */
export function GET() {
  const rawKey = process.env.GEMINI_API_KEY;
  const similarNames = Object.keys(process.env).filter((name) => /gemini|google|api_?key/i.test(name));

  return Response.json({
    ok: true,
    version: APP_VERSION,
    geminiKey: rawKey && rawKey.trim() ? "set" : "missing",
    keyLength: rawKey ? rawKey.trim().length : 0,
    similarEnvNames: similarNames,
  });
}
