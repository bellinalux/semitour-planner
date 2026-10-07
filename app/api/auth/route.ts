import { accessRequired, getSession, loginCookie, logoutCookie, workspaceId } from "@/lib/server/access";
import { getKv } from "@/lib/server/planStore";
import { allowLoginAttempt } from "@/lib/server/rateLimit";
import { audit } from "@/lib/server/audit";

/**
 * 로그인 상태: { required: 잠금 여부, authed: 이 브라우저가 통과했는지, user: 로그인한 사람, accounts: 직원 계정을 쓸 수 있는지 }
 */
export async function GET(request: Request) {
  const session = await getSession(request);
  const accounts = accessRequired() && (await workspaceId()) !== null && (await getKv()) !== null;
  return Response.json({
    required: accessRequired(),
    authed: session !== null,
    user: session && accessRequired() ? { name: session.name, role: session.role, isMaster: session.id === "master" } : null,
    accounts,
  });
}

/** 관리자 접속 코드 또는 직원 개인 코드 확인. 맞으면 로그인 쿠키를 내려준다. */
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

  const login = await loginCookie(request, code);
  if (!login) {
    await audit(await workspaceId(), null, "로그인 실패", "틀린 코드");
    return Response.json({ error: { code: "WRONG_CODE", message: "접근 코드가 올바르지 않습니다." } }, { status: 401 });
  }
  await audit(await workspaceId(), login.session, "로그인");
  return Response.json({ ok: true, user: { name: login.session.name, role: login.session.role } }, { headers: { "Set-Cookie": login.cookie } });
}

/** 로그아웃 (다른 직원으로 바꿔 들어갈 때) */
export async function DELETE(request: Request) {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": logoutCookie(request) } });
}
