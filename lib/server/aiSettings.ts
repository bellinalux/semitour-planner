/**
 * 앱 안 "AI 키 설정" — 관리자가 화면에서 넣은 AI 키·모델·순서.
 *  - KV(PLANS) `aisettings:{작업공간}`에 저장. 키는 AES-GCM으로 암호화하고, 화면에는 끝 4자리만 보인다.
 *  - 암호화 키는 APP_SECRET_KEY(있으면) 또는 관리자 접속 코드에서 만든다.
 *    → 접속 코드를 바꾸면(APP_SECRET_KEY 없이) 저장한 키를 풀 수 없어 다시 입력해야 한다.
 *  - 앱에서 넣은 값이 Cloudflare 변수(환경변수)보다 우선한다. 앱 값을 지우면 환경변수를 쓴다.
 *  - AI를 부를 때마다 KV를 읽지 않도록 인스턴스 안에서 30초 기억한다(저장하면 바로 새로 읽음).
 */
import { readSecret } from "./external";
import { getKv } from "./planStore";
import { workspaceId } from "./access";

export type AiSettingName = "GEMINI_API_KEY" | "GEMINI_BACKUP_API_KEY" | "GROQ_API_KEY" | "OPENROUTER_API_KEY" | "TAVILY_API_KEY" | "GEMINI_MODEL" | "AI_PROVIDERS";
const SECRET_NAMES = new Set<AiSettingName>(["GEMINI_API_KEY", "GEMINI_BACKUP_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "TAVILY_API_KEY"]);
export const AI_SETTING_NAMES: AiSettingName[] = ["GEMINI_API_KEY", "GEMINI_BACKUP_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "TAVILY_API_KEY", "GEMINI_MODEL", "AI_PROVIDERS"];

interface Sealed {
  iv: string;
  ct: string;
}
interface Stored {
  v: 1;
  values: Partial<Record<AiSettingName, Sealed | string>>;
  updatedAt: string;
  updatedBy: string;
}

interface Loaded {
  at: number;
  values: Partial<Record<AiSettingName, string>>;
  /** 저장돼 있지만 풀지 못한 키 (접속 코드가 바뀐 경우) */
  broken: AiSettingName[];
  updatedAt: string;
  updatedBy: string;
}

const CACHE_MS = 30_000;
const EMPTY: Loaded = { at: 0, values: {}, broken: [], updatedAt: "", updatedBy: "" };

function cache(): { current: Loaded } {
  const g = globalThis as unknown as { __semitourAiSettings?: { current: Loaded } };
  return (g.__semitourAiSettings ??= { current: EMPTY });
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function cryptoKey(): Promise<CryptoKey | null> {
  const base = readSecret("APP_SECRET_KEY") ?? process.env.APP_ACCESS_CODE?.trim() ?? "";
  if (!base) return null;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`semitour-aikeys:${base}`));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function seal(text: string, key: CryptoKey): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  return { iv: b64(iv), ct: b64(ct) };
}

async function unseal(s: Sealed, key: CryptoKey): Promise<string | null> {
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(s.iv) }, key, unb64(s.ct));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

async function store() {
  const ws = await workspaceId();
  const kv = await getKv();
  return ws && kv ? { kv: kv.kv, key: `aisettings:${ws}` } : null;
}

/** 앱 설정을 쓸 수 있는가 (접속 코드 + 서버 저장소가 있어야 한다) */
export async function aiSettingsAvailable(): Promise<boolean> {
  return (await store()) !== null;
}

async function readStored(): Promise<Stored | null> {
  const s = await store();
  if (!s) return null;
  try {
    const raw = await s.kv.get(s.key);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    return parsed && parsed.v === 1 && typeof parsed.values === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** KV에서 다시 읽어 기억해 둔다. AI를 부르기 전에 한 번 부른다(30초 안이면 그냥 넘어간다) */
export async function refreshAiSettings(force = false): Promise<void> {
  const c = cache();
  if (!force && Date.now() - c.current.at < CACHE_MS) return;
  const stored = await readStored();
  const key = stored ? await cryptoKey() : null;
  const values: Loaded["values"] = {};
  const broken: AiSettingName[] = [];
  for (const name of AI_SETTING_NAMES) {
    const v = stored?.values[name];
    if (v === undefined) continue;
    if (typeof v === "string") values[name] = v;
    else {
      const plain = key ? await unseal(v, key) : null;
      if (plain) values[name] = plain;
      else broken.push(name);
    }
  }
  c.current = { at: Date.now(), values, broken, updatedAt: stored?.updatedAt ?? "", updatedBy: stored?.updatedBy ?? "" };
}

/** 앱에서 넣은 값 > 환경변수. 둘 다 없으면 null (AI를 부르는 곳에서 동기로 읽는다 — 먼저 refreshAiSettings) */
export function aiSetting(name: AiSettingName): string | null {
  const app = cache().current.values[name]?.trim();
  if (app) return app;
  return SECRET_NAMES.has(name) ? readSecret(name) : process.env[name]?.trim() || null;
}

/** 관리자 화면용 — 값 자체는 내보내지 않는다 (키는 끝 4자리만) */
export async function aiSettingsView() {
  await refreshAiSettings(true);
  const c = cache().current;
  const one = (name: AiSettingName) => {
    const app = c.values[name] ?? null;
    const env = SECRET_NAMES.has(name) ? readSecret(name) : process.env[name]?.trim() || null;
    const secret = SECRET_NAMES.has(name);
    return {
      app: app !== null,
      appValue: app === null ? null : secret ? `…${app.slice(-4)}` : app,
      env: env !== null,
      envValue: env === null ? null : secret ? `…${env.slice(-4)}` : env,
      broken: c.broken.includes(name),
      source: app !== null ? ("app" as const) : env !== null ? ("cloudflare" as const) : null,
    };
  };
  return {
    available: await aiSettingsAvailable(),
    updatedAt: c.updatedAt,
    updatedBy: c.updatedBy,
    settings: Object.fromEntries(AI_SETTING_NAMES.map((n) => [n, one(n)])) as Record<AiSettingName, ReturnType<typeof one>>,
  };
}

/** 저장 — 글자: 바꿈, null: 지움(환경변수로 돌아감), undefined: 그대로. 바뀐 이름 목록 */
export async function saveAiSettings(patch: Partial<Record<AiSettingName, string | null>>, by: string): Promise<AiSettingName[]> {
  const s = await store();
  if (!s) throw new Error("NO_STORE");
  const key = await cryptoKey();
  if (!key) throw new Error("NO_KEY");
  const current = (await readStored()) ?? { v: 1 as const, values: {}, updatedAt: "", updatedBy: "" };
  const values = { ...current.values };
  const changed: AiSettingName[] = [];
  for (const name of AI_SETTING_NAMES) {
    const v = patch[name];
    if (v === undefined) continue;
    changed.push(name);
    if (v === null || v.trim() === "") delete values[name];
    else values[name] = SECRET_NAMES.has(name) ? await seal(v.trim(), key) : v.trim();
  }
  const next: Stored = { v: 1, values, updatedAt: new Date().toISOString(), updatedBy: by };
  await s.kv.put(s.key, JSON.stringify(next));
  await refreshAiSettings(true);
  return changed;
}
