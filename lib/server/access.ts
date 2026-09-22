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

/** 잠금이 꺼져 있거나, 올바른 접근 쿠키가 있으면 true */
export async function isAuthed(request: Request): Promise<boolean> {
  if (!accessRequired()) return true;
  const token = readCookie(request, COOKIE_NAME);
  return token !== null && safeEqual(token, await expectedToken());
}

/** 입력한 코드가 맞으면 로그인 쿠키(Set-Cookie 값)를, 틀리면 null을 돌려준다 */
export async function loginCookie(request: Request, code: string): Promise<string | null> {
  if (!accessRequired()) return null;
  const expected = await sha256Hex(configuredCode());
  const given = await sha256Hex(code.trim());
  if (!safeEqual(expected, given)) return null;

  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${await expectedToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}${secure}`;
}
