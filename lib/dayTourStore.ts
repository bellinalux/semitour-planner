import { COMPANY_KEYS, type CompanyDayTourDefaults, type DayTourSettings } from "@/lib/dayTour";
import type { DayTourLeg, DayTourRequest, DayTourResponse, DayTourStop } from "@/lib/schemas/dayTour";

/**
 * 근교 투어 저장 — 이 브라우저에만 (백업 파일에 함께 들어가도록 semitour-planner: 접두어).
 *  - 회사 원가 기본값(기사·가이드 인건비, 차량 고정비, 보험, 마진율): 한 번 맞추면 다음 투어부터 그대로
 *  - 만든 투어 목록(최근 20개): 다시 열어 고치거나 선택관광으로 넣는다
 */
const DEFAULTS_KEY = "semitour-planner:dayTourDefaults";
const SAVED_KEY = "semitour-planner:dayTours";
const MAX_SAVED = 20;

export interface SavedDayTour {
  id: string;
  savedAt: string;
  title: string;
  summary: string;
  request: DayTourRequest;
  response: DayTourResponse;
  stops: DayTourStop[];
  legs: DayTourLeg[];
  settings: DayTourSettings;
  shareId?: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadCompanyDefaults(): CompanyDayTourDefaults {
  const raw = read<Record<string, unknown>>(DEFAULTS_KEY, {});
  const out: CompanyDayTourDefaults = {};
  for (const k of COMPANY_KEYS) if (typeof raw[k] === "number" && Number.isFinite(raw[k])) out[k] = raw[k] as number;
  return out;
}

export function saveCompanyDefaults(s: DayTourSettings): boolean {
  return write(DEFAULTS_KEY, Object.fromEntries(COMPANY_KEYS.map((k) => [k, s[k]])));
}

export function loadSavedDayTours(): SavedDayTour[] {
  const list = read<SavedDayTour[]>(SAVED_KEY, []);
  return Array.isArray(list) ? list.filter((t) => t && typeof t.id === "string" && Array.isArray(t.stops)) : [];
}

/** 같은 id면 바꿔 넣고, 새 것은 맨 앞에 (최근 20개) */
export function saveDayTour(tour: SavedDayTour): SavedDayTour[] {
  const list = [tour, ...loadSavedDayTours().filter((t) => t.id !== tour.id)].slice(0, MAX_SAVED);
  write(SAVED_KEY, list);
  return list;
}

export function deleteDayTour(id: string): SavedDayTour[] {
  const list = loadSavedDayTours().filter((t) => t.id !== id);
  write(SAVED_KEY, list);
  return list;
}
