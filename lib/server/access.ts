import { hashStaffCode, listStaff, saveStaff, type StaffRole } from "./staff";

/**
 * 접근 코드(공용 비밀번호) 확인.
 * 환경변수 APP_ACCESS_CODE가 설정되어 있으면 그 코드를 아는 사람만 AI 기능(API)을 쓸 수 있다.
 * 설정되어 있지 않으면 잠금이 꺼진 상태(로컬 개발용)다.
 */

const COOKIE_NAME = "sp_access";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function configuredCode(): string {
  return process.env.APP_ACCESS_CODE?.trim() ?? "";
}

export function accessRequired(): boolean {
  return configuredCode() !== "";
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 서버 저장(일정 보관함)의 작업공간 ID. 접근 코드로 만든 해시라서 같은 코드를 쓰는 사람끼리 같은 보관함을 본다.
 * 접근 코드가 없으면(잠금 꺼짐) null — 그때는 아무나 남의 데이터에 접근할 수 있으므로 서버 저장을 쓰지 않는다.
 */
export async function workspaceId(): Promise<string | null> {
  if (!accessRequired()) return null;
  return (await sha256Hex(`semitour-workspace:${configuredCode()}`)).slice(0, 32);
}

/** 입력한 코드가 서버의 접근 코드와 같은지 (스튜디오 AI 중계용 — 쿠키 대신 헤더로 받는다) */
export async function codeMatches(code: string): Promise<boolean> {
  if (!accessRequired() || !code.trim()) return false;
  return safeEqual(await sha256Hex(configuredCode()), await sha256Hex(code.trim()));
}

/** 쿠키에 저장하는 값. 코드 자체가 아니라 코드로 만든 해시라서 쿠키가 노출돼도 코드를 알 수 없다. */
async function expectedToken(): Promise<string> {
  return sha256Hex(`semitour-access:${configuredCode()}`);
}

/** 길이가 같은 두 문자열을 시간 차이 없이 비교한다 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** 로그인한 사람. 관리자(공용 접속 코드)는 id "master" */
export interface Session {
  id: string;
  name: string;
  role: StaffRole;
}

const MASTER: Session = { id: "master", name: "관리자", role: "admin" };
/** 잠금이 꺼진 로컬 개발 환경 */
const LOCAL: Session = { id: "local", name: "", role: "admin" };

/** 로그인 쿠키 서명 키 — 접속 코드에서 만들어, 코드를 바꾸면 모든 로그인이 풀린다 */
async function signingKey(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`semitour-session:${configuredCode()}`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(payload: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const b64url = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (text: string) => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** 쿠키 값: "v2.<내용>.<서명>" — 내용은 직원 ID와 발급 시각뿐이고, 권한·이름은 매번 직원 목록에서 다시 읽는다 */
async function sessionToken(staffId: string): Promise<string> {
  const payload = b64url(JSON.stringify({ sid: staffId, iat: Date.now() }));
  return `v2.${payload}.${await sign(payload)}`;
}

/** 로그인한 사람. 잠금이 꺼져 있으면 로컬 관리자, 쿠키가 없거나 틀렸거나 계정이 꺼졌으면 null */
export async function getSession(request: Request): Promise<Session | null> {
  if (!accessRequired()) return LOCAL;
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  // 예전 방식 쿠키(공용 코드 하나)는 관리자로 본다 — 이미 로그인한 사람이 다시 입력하지 않아도 되게
  if (safeEqual(token, await expectedToken())) return MASTER;
  const [version, payload, sig] = token.split(".");
  if (version !== "v2" || !payload || !sig || !safeEqual(sig, await sign(payload))) return null;
  let sid = "";
  try {
    sid = String((JSON.parse(fromB64url(payload)) as { sid?: unknown }).sid ?? "");
  } catch {
    return null;
  }
  if (sid === MASTER.id) return MASTER;
  const ws = await workspaceId();
  if (!ws) return null;
  const member = (await listStaff(ws)).find((m) => m.id === sid && m.active);
  return member ? { id: member.id, name: member.name, role: member.role } : null;
}

/** 잠금이 꺼져 있거나, 올바른 로그인 쿠키가 있으면 true */
export async function isAuthed(request: Request): Promise<boolean> {
  return (await getSession(request)) !== null;
}

/** 관리자만 할 수 있는 작업이면 거절 응답을, 통과하면 null */
export async function requireAdmin(request: Request): Promise<Response | null> {
  const session = await getSession(request);
  if (!session) return Response.json({ error: { code: "UNAUTHORIZED", message: "접근 코드가 필요합니다." } }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: { code: "FORBIDDEN", message: "관리자만 바꿀 수 있습니다." } }, { status: 403 });
  return null;
}

function cookieHeader(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** 로그아웃용 쿠키 (바로 만료) */
export function logoutCookie(request: Request): string {
  return cookieHeader(request, "", 0);
}

/**
 * 입력한 코드가 관리자 코드이거나 켜져 있는 직원의 개인 코드면 로그인 쿠키(Set-Cookie 값)와 그 사람을, 아니면 null.
 */
export async function loginCookie(request: Request, code: string): Promise<{ cookie: string; session: Session } | null> {
  if (!accessRequired() || !code.trim()) return null;
  if (await codeMatches(code)) return { cookie: cookieHeader(request, await sessionToken(MASTER.id), COOKIE_MAX_AGE_SECONDS), session: MASTER };

  const ws = await workspaceId();
  if (!ws) return null;
  const hash = await hashStaffCode(ws, code);
  const list = await listStaff(ws, true);
  const member = list.find((m) => m.active && safeEqual(m.codeHash, hash));
  if (!member) return null;
  // 마지막 접속 시각은 기록에 실패해도 로그인에는 영향이 없다
  await saveStaff(
    ws,
    list.map((m) => (m.id === member.id ? { ...m, lastLoginAt: new Date().toISOString() } : m)),
  ).catch(() => undefined);
  return { cookie: cookieHeader(request, await sessionToken(member.id), COOKIE_MAX_AGE_SECONDS), session: { id: member.id, name: member.name, role: member.role } };
}
