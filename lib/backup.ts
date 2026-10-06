/**
 * 이 브라우저에 저장된 세미투어 데이터 전체(입력값, 작업 중인 일정, 저장한 일정, 회사 기본값, 원가 기억, 견적 이력 등)를
 * 파일 하나로 내려받고 되살린다. 브라우저를 바꾸거나 저장소가 지워질 때를 대비한 백업이다.
 */
const PREFIX = "semitour-planner:";
const APP = "semitour-planner";
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export interface BackupFile {
  app: typeof APP;
  version: 1;
  exportedAt: string;
  data: Record<string, string>;
}

export function collectBackup(): BackupFile {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return { app: APP, version: 1, exportedAt: new Date().toISOString(), data };
}

/** 백업 파일 내용을 확인한다. 세미투어 백업이 아니거나 깨졌으면 오류 문장 */
export function parseBackup(text: string): BackupFile | string {
  if (text.length > MAX_BACKUP_BYTES) return "파일이 너무 큽니다.";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "백업 파일 형식이 아닙니다.";
  }
  const o = parsed as Partial<BackupFile> | null;
  if (!o || o.app !== APP || o.version !== 1 || typeof o.data !== "object" || o.data === null) return "세미투어 백업 파일이 아닙니다.";
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(o.data)) {
    // 다른 앱의 키나 문자열이 아닌 값은 넣지 않는다
    if (key.startsWith(PREFIX) && typeof value === "string") data[key] = value;
  }
  if (Object.keys(data).length === 0) return "백업 파일에 되살릴 내용이 없습니다.";
  return { app: APP, version: 1, exportedAt: typeof o.exportedAt === "string" ? o.exportedAt : "", data };
}

/** 백업으로 되살린다 — 지금 브라우저의 세미투어 데이터는 백업 내용으로 바뀐다. 되살린 항목 수 */
export function restoreBackup(backup: BackupFile): number {
  const remove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX) && !(key in backup.data)) remove.push(key);
  }
  remove.forEach((k) => localStorage.removeItem(k));
  for (const [key, value] of Object.entries(backup.data)) localStorage.setItem(key, value);
  return Object.keys(backup.data).length;
}

export function backupFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `세미투어-백업-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}
