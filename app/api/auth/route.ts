import { accessRequired, isAuthed, loginCookie } from "@/lib/server/access";
import { allowLoginAttempt } from "@/lib/server/rateLimit";

/** 접근 잠금 상태 확인: { required: 잠금 여부, authed: 이 브라우저가 통과했는지 } */
export async function GET(request: Request) {
  return Response.json({ required: accessRequired(), authed: await isAuthed(request) });
}

/** 접근 코드 확인. 맞으면 로그인 쿠키를 내려준다. */
export async function POST(request: Request) {
  if (!accessRequired()) return Response.json({ ok: true });

  if (!allowLoginAttempt(request)) {
    return Response.json(
      { error: { code: "RATE_LIMITED", message: "시도 횟수가 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요." } },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    return Response.json({ error: { code: "BAD_REQUEST", message: "요청 형식이 올바르지 않습니다." } }, { status: 400 });
  }

  const cookie = await loginCookie(request, code);
  if (!cookie) {
    return Response.json({ error: { code: "WRONG_CODE", message: "접근 코드가 올바르지 않습니다." } }, { status: 401 });
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
