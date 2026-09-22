import { normalizeInput } from "@/lib/inputStorage";
import type { PmChoice } from "@/lib/itinerary";
import type { CourseMeta, CurrencyCode, DayPlan, TripInput, UspItem } from "@/types";

/** 생성된 결과물 (일정·오후 코스 선택·상품 정보·세일즈 포인트). 새로고침해도 유지되는 "작업 중" 상태다. */
export interface ResultSnapshot {
  days: DayPlan[];
  pmChoice: PmChoice;
  meta: CourseMeta | null;
  generatedCurrency: CurrencyCode | null;
  usps: UspItem[];
  /** 세일즈 포인트를 만들 때 쓴 요청의 지문 (이후 바뀌었는지 비교) */
  uspKey: string | null;
}

/** 저장 한 건 = 입력 + 결과물 */
export interface PlanSnapshot extends ResultSnapshot {
  input: TripInput;
}

export interface SavedPlan {
  id: string;
  name: string;
  savedAt: string;
  snapshot: PlanSnapshot;
}

/** 저장 목록에 보여줄 요약. 서버 저장은 이것만 먼저 내려받고, 일정 전체는 불러올 때 받는다. */
export interface PlanIndexEntry {
  id: string;
  name: string;
  savedAt: string;
  summary: string;
}

export function indexEntryOf(plan: SavedPlan): PlanIndexEntry {
  return { id: plan.id, name: plan.name, savedAt: plan.savedAt, summary: planSummary(plan) };
}

export const EMPTY_RESULT: ResultSnapshot = {
  days: [],
  pmChoice: {},
  meta: null,
  generatedCurrency: null,
  usps: [],
  uspKey: null,
};

export const MAX_PLANS = 30;
export const MAX_NAME_LENGTH = 60;
/** 가져올 파일 크기 상한 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const FILE_KIND = "semitour-planner-plan";
const FILE_VERSION = 1;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isItem(v: unknown): boolean {
  return isObj(v) && typeof v.id === "string" && typeof v.name === "string";
}

function parseDay(v: unknown): DayPlan | null {
  if (!isObj(v) || typeof v.day !== "number" || (v.kind !== "semi" && v.kind !== "linear")) return null;
  const list = (x: unknown) => (Array.isArray(x) ? x : []);
  const amGuided = list(v.amGuided);
  const items = list(v.items);
  const pmFreeOptions = list(v.pmFreeOptions);
  if (!amGuided.every(isItem) || !items.every(isItem)) return null;
  if (!pmFreeOptions.every((o) => isObj(o) && (o.id === "A" || o.id === "B") && list(o.items).every(isItem))) return null;
  return { ...(v as unknown as DayPlan), theme: typeof v.theme === "string" ? v.theme : "", amGuided, items, pmFreeOptions };
}

function parseResult(v: unknown): ResultSnapshot | null {
  if (!isObj(v) || !Array.isArray(v.days)) return null;
  const days: DayPlan[] = [];
  for (const d of v.days) {
    const day = parseDay(d);
    if (!day) return null;
    days.push(day);
  }

  const pmChoice: PmChoice = {};
  if (isObj(v.pmChoice)) {
    for (const [k, val] of Object.entries(v.pmChoice)) {
      if ((val === "A" || val === "B") && Number.isFinite(Number(k))) pmChoice[Number(k)] = val;
    }
  }

  const meta = isObj(v.meta) && Array.isArray(v.meta.cities) && typeof v.meta.packageName === "string" ? (v.meta as unknown as CourseMeta) : null;
  const usps = Array.isArray(v.usps)
    ? v.usps.filter((u): u is UspItem => isObj(u) && typeof u.title === "string" && typeof u.reason === "string")
    : [];

  return {
    days,
    pmChoice,
    meta,
    generatedCurrency: typeof v.generatedCurrency === "string" ? (v.generatedCurrency as CurrencyCode) : null,
    usps,
    uspKey: usps.length > 0 && typeof v.uspKey === "string" ? v.uspKey : null,
  };
}

/** 저장소나 파일에서 읽은 값을 검증하고 현재 형식으로 맞춘다. 형식이 맞지 않으면 null. */
export function parseSnapshot(v: unknown): PlanSnapshot | null {
  if (!isObj(v) || !isObj(v.input)) return null;
  const result = parseResult(v);
  if (!result) return null;
  return { ...result, input: normalizeInput(v.input) };
}

export function parseResultSnapshot(v: unknown): ResultSnapshot | null {
  return parseResult(v);
}

export function parsePlan(v: unknown): SavedPlan | null {
  if (!isObj(v) || typeof v.id !== "string" || typeof v.name !== "string" || typeof v.savedAt !== "string") return null;
  const snapshot = parseSnapshot(v.snapshot);
  return snapshot ? { id: v.id, name: v.name.slice(0, MAX_NAME_LENGTH), savedAt: v.savedAt, snapshot } : null;
}

/** 이름 입력란의 기본값 (예: "파타야 1박 2일 · 6명") */
export function suggestPlanName(input: TripInput, meta: CourseMeta | null): string {
  const place = (meta?.packageName || input.destination).trim();
  const span = input.nights > 0 || input.days > 1 ? `${input.nights}박 ${input.days}일` : `${input.days}일`;
  const head = place ? `${place} ${span}` : span;
  return `${head} · ${Math.max(1, Math.round(input.travelers))}명`.slice(0, MAX_NAME_LENGTH);
}

/** 저장 목록에 보여줄 한 줄 요약 */
export function planSummary(plan: SavedPlan): string {
  const { input, days } = plan.snapshot;
  const parts = [input.destination.trim() || "여행지 미입력", `${input.nights}박 ${input.days}일`, `${input.travelers}명`];
  parts.push(days.length > 0 ? "일정 생성됨" : "일정 없음(입력만)");
  if (input.options.length > 0) parts.push(`옵션 ${input.options.length}개`);
  return parts.join(" · ");
}

export function newPlanId(): string {
  return `plan-${crypto.randomUUID().slice(0, 8)}`;
}

/** 내려받기용 파일 내용 */
export function serializePlanFile(plan: SavedPlan): string {
  return JSON.stringify({ kind: FILE_KIND, version: FILE_VERSION, plan }, null, 2);
}

/** 파일 내용을 읽는다. 실패하면 사람이 읽을 수 있는 오류 문장을 돌려준다. */
export function parsePlanFile(text: string): { plan: SavedPlan } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "JSON 파일이 아닙니다. 이 앱에서 내려받은 파일인지 확인해 주세요." };
  }
  if (!isObj(raw) || raw.kind !== FILE_KIND) return { error: "이 앱에서 내려받은 일정 파일이 아닙니다." };
  if (typeof raw.version === "number" && raw.version > FILE_VERSION) {
    return { error: "더 새로운 버전에서 만든 파일입니다. 앱을 최신으로 업데이트한 뒤 다시 시도해 주세요." };
  }
  const plan = parsePlan(raw.plan);
  if (!plan) return { error: "파일 내용이 손상되었거나 형식이 맞지 않습니다." };
  return { plan };
}

/** 파일 이름으로 쓸 수 없는 문자를 뺀다 */
export function fileNameFor(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "일정";
  return `${safe}.semitour.json`;
}
