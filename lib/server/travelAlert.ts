import { ALERT_LABELS } from "@/lib/travelAlert";
import type { TravelAlert } from "@/types";
import { ExternalError, isRecord, readSecret } from "./external";
import { resolvePlace } from "./places";

/**
 * 외교부 국가·지역별 여행경보 (공공데이터포털 1262000/TravelAlarmService2).
 * 관광진흥법 시행규칙 §21 제8호가 기획여행 안내에 표시하도록 정한 항목이다.
 */
const BASE_URL = "https://apis.data.go.kr/1262000/TravelAlarmService2/getTravelAlarmList2";
/** 국가 목록은 자주 바뀌지 않아 서버 메모리에 6시간 보관한다 */
const CACHE_MS = 6 * 60 * 60 * 1000;

interface AlarmRow {
  countryKo: string;
  countryEn: string;
  iso: string;
  level: number;
  /** 특별여행주의보 등 구분 */
  regionType: string;
  remark: string;
  writtenAt: string;
}

let cache: { at: number; rows: AlarmRow[] } | null = null;

function toRow(raw: unknown): AlarmRow | null {
  if (!isRecord(raw)) return null;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  const countryKo = text(raw.country_nm);
  if (!countryKo) return null;
  const level = Number(text(raw.alarm_lvl));
  return {
    countryKo,
    countryEn: text(raw.country_eng_nm),
    iso: text(raw.country_iso_alp2).toUpperCase(),
    level: Number.isFinite(level) && level >= 0 && level <= 4 ? level : 0,
    regionType: text(raw.region_ty),
    remark: text(raw.remark),
    writtenAt: text(raw.written_dt),
  };
}

/** 응답 본문에서 목록 배열을 찾는다. 공공데이터 응답은 래핑 형태가 서비스마다 조금씩 다르다. */
function extractItems(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!isRecord(body)) return [];
  const data = body.data;
  if (Array.isArray(data)) return data;
  const response = isRecord(body.response) ? body.response : null;
  const bodyNode = response && isRecord(response.body) ? response.body : null;
  if (bodyNode) {
    if (Array.isArray(bodyNode.items)) return bodyNode.items;
    const items = isRecord(bodyNode.items) ? bodyNode.items.item : undefined;
    if (Array.isArray(items)) return items;
    if (isRecord(items)) return [items];
  }
  return [];
}

async function loadRows(key: string): Promise<AlarmRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;

  const params = new URLSearchParams({ serviceKey: key, numOfRows: "300", pageNo: "1", returnType: "JSON" });
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}?${params}`, { signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ExternalError("TIMEOUT", "여행경보 조회 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", 504);
    }
    throw new ExternalError("UPSTREAM", "여행경보 서버에 연결하지 못했습니다.", 502);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ExternalError("UPSTREAM", `여행경보 서버 오류 (${res.status}). 서비스 키와 활용 신청 상태를 확인해 주세요.`, 502);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // 키가 잘못되면 공공데이터포털이 XML 오류 문서를 돌려준다
    const reason = /SERVICE_KEY_IS_NOT_REGISTERED|SERVICE ERROR|INVALID_REQUEST_PARAMETER/i.test(text)
      ? "서비스 키가 등록되지 않았거나 승인 대기 중일 수 있습니다."
      : "응답 형식을 읽지 못했습니다.";
    throw new ExternalError("BAD_OUTPUT", `여행경보를 가져오지 못했습니다. ${reason}`, 502);
  }

  const rows = extractItems(body)
    .map(toRow)
    .filter((r): r is AlarmRow => r !== null);
  if (rows.length === 0) {
    throw new ExternalError("BAD_OUTPUT", "여행경보 목록이 비어 있습니다. 공공데이터포털에서 이 API의 활용 신청 상태를 확인해 주세요.", 502);
  }
  cache = { at: Date.now(), rows };
  return rows;
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

function findRow(rows: AlarmRow[], countryKo: string, countryEn: string): AlarmRow | null {
  const ko = norm(countryKo);
  const en = norm(countryEn);
  // 같은 나라에 여러 줄(지역별 경보)이 있으면 가장 높은 단계를 대표로 삼는다
  const matched = rows.filter((r) => (ko && norm(r.countryKo).includes(ko)) || (en && norm(r.countryEn) === en));
  if (matched.length === 0) return null;
  return matched.reduce((best, r) => (r.level > best.level ? r : best));
}

/** 여행지의 여행경보단계를 조회한다. */
export async function lookupTravelAlert(destination: string): Promise<TravelAlert> {
  const key = readSecret("DATA_GO_KR_KEY");
  if (!key) {
    throw new ExternalError(
      "NO_KEY",
      "여행경보 조회용 키(DATA_GO_KR_KEY)가 등록되지 않았습니다. 공공데이터포털에서 '외교부_국가·지역별 여행경보' 활용 신청 후 키를 등록하거나, 경보단계를 직접 입력해 주세요.",
      503,
    );
  }

  const place = await resolvePlace(destination);
  const rows = await loadRows(key);
  const row = findRow(rows, place.countryKo, place.country);
  if (!row) {
    throw new ExternalError(
      "NOT_FOUND",
      `"${place.countryKo || destination}"의 여행경보를 목록에서 찾지 못했습니다. 경보단계를 직접 입력해 주세요.`,
      404,
    );
  }

  const special = /특별여행/.test(row.regionType) || /특별여행/.test(row.remark);
  return {
    country: row.countryKo,
    level: row.level,
    levelLabel: ALERT_LABELS[row.level] ?? ALERT_LABELS[0],
    note: [special ? "특별여행주의보 발령 지역이 포함되어 있습니다" : "", row.regionType].filter(Boolean).join(" · "),
    checkedAt: new Date().toISOString(),
    source: "api",
  };
}
