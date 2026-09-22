import { ALERT_LABELS } from "@/lib/travelAlert";
import type { TravelAlert } from "@/types";
import { ExternalError, fetchJson, isRecord, readSecret } from "./external";
import { resolvePlace } from "./places";

/**
 * 외교부 국가별 여행경보단계.
 *
 * 1순위: 0404.go.kr(외교부 해외안전여행 홈페이지)이 자기 화면(국가 지도)을 그릴 때 쓰는
 * 공개 목록 API. 키·가입이 전혀 필요 없다. 공식 오픈API가 아니라 홈페이지 내부용이라
 * 예고 없이 바뀌거나 막힐 수 있어, 실패하면 2순위로 넘어간다.
 * 2순위: 공공데이터포털 TravelAlarmService2 (DATA_GO_KR_KEY를 등록했을 때만).
 */

const CACHE_MS = 6 * 60 * 60 * 1000;

/** 국외여행 표준약관·관광진흥법이 말하는 4단계 + 특별여행주의보 */
type Level = 0 | 1 | 2 | 3 | 4;

interface CountryRow {
  countryKo: string;
  countryEn: string;
  /** 전역(국가 전체) 경보의 최고 단계. 없으면 0 */
  levelAll: Level;
  /** 일부 지역에만 걸린 경보의 최고 단계 (전역엔 없지만 참고할 값). 없으면 0 */
  levelSome: Level;
  special: boolean;
}

/* ---------------------------- 1순위: 0404.go.kr ---------------------------- */

const MOFA_URL = "https://www.0404.go.kr/util/getNtnList";
let mofaCache: { at: number; rows: CountryRow[] } | null = null;

/** 단계 → All/Some 플래그 필드 이름 (0404 응답 형식) */
const LEVEL_FIELDS: { level: Level; all: string; some: string }[] = [
  { level: 4, all: "trvlPrhbAllYn", some: "trvlPrhbSomeYn" }, // 여행금지
  { level: 3, all: "dptcnyAdvsAllYn", some: "dptcnyAdvsSomeYn" }, // 출국권고
  { level: 2, all: "trvlRfranAllYn", some: "trvlRfranSomeYn" }, // 여행자제
  { level: 1, all: "trvlCutnAllYn", some: "trvlCutnSomeYn" }, // 여행유의
];

function toCountryRow(raw: unknown): CountryRow | null {
  if (!isRecord(raw)) return null;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const countryKo = text(raw.ntnNm);
  if (!countryKo) return null;

  let levelAll: Level = 0;
  let levelSome: Level = 0;
  for (const f of LEVEL_FIELDS) {
    if (raw[f.all] === "Y" && f.level > levelAll) levelAll = f.level;
    if (raw[f.some] === "Y" && f.level > levelSome) levelSome = f.level;
  }
  return {
    countryKo,
    countryEn: text(raw.ntnEnNm),
    levelAll,
    levelSome,
    special: raw.spclTrvlCutnAllYn === "Y" || raw.spclTrvlCutnSomeYn === "Y",
  };
}

async function loadMofaRows(): Promise<CountryRow[]> {
  if (mofaCache && Date.now() - mofaCache.at < CACHE_MS) return mofaCache.rows;

  const res = await fetchJson(
    MOFA_URL,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ searchType: "total" }) },
    15_000,
    "여행경보(0404.go.kr)",
  );
  if (!res.ok || !isRecord(res.body) || res.body.success !== true || !Array.isArray(res.body.data)) {
    throw new ExternalError("UPSTREAM", "0404.go.kr에서 국가 목록을 가져오지 못했습니다.", 502);
  }

  const rows = res.body.data.map(toCountryRow).filter((r): r is CountryRow => r !== null);
  if (rows.length === 0) throw new ExternalError("BAD_OUTPUT", "0404.go.kr 응답에서 국가 목록을 읽지 못했습니다.", 502);

  mofaCache = { at: Date.now(), rows };
  return rows;
}

function findCountryRow(rows: CountryRow[], countryKo: string, countryEn: string): CountryRow | null {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const ko = norm(countryKo);
  const en = norm(countryEn);
  return rows.find((r) => (en && norm(r.countryEn) === en) || (ko && norm(r.countryKo).includes(ko))) ?? null;
}

async function lookupFromMofaSite(destination: string): Promise<TravelAlert> {
  const place = await resolvePlace(destination);
  const rows = await loadMofaRows();
  const row = findCountryRow(rows, place.countryKo, place.country);
  if (!row) throw new ExternalError("NOT_FOUND", `"${place.countryKo || destination}"을(를) 목록에서 찾지 못했습니다.`, 404);

  // 전역 경보가 없으면 일부 지역 경보라도 참고로 보여 주되, 전역이 아니라고 밝힌다
  const level = row.levelAll > 0 ? row.levelAll : row.levelSome;
  const scopeNote = row.levelAll > 0 ? "" : row.levelSome > 0 ? "일부 지역에만 해당 (국가 전역 경보는 아님)" : "";
  const specialNote = row.special ? "특별여행주의보 발령 지역 포함" : "";

  return {
    country: row.countryKo,
    level,
    levelLabel: ALERT_LABELS[level] ?? ALERT_LABELS[0],
    note: [scopeNote, specialNote].filter(Boolean).join(" · "),
    checkedAt: new Date().toISOString(),
    source: "api",
  };
}

/* ------------------------- 2순위: 공공데이터포털(예비) ------------------------- */

const DATA_GO_KR_URL = "https://apis.data.go.kr/1262000/TravelAlarmService2/getTravelAlarmList2";

interface AlarmRow {
  countryKo: string;
  countryEn: string;
  level: number;
  regionType: string;
  remark: string;
}

let dataGoKrCache: { at: number; rows: AlarmRow[] } | null = null;

function toAlarmRow(raw: unknown): AlarmRow | null {
  if (!isRecord(raw)) return null;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  const countryKo = text(raw.country_nm);
  if (!countryKo) return null;
  const level = Number(text(raw.alarm_lvl));
  return {
    countryKo,
    countryEn: text(raw.country_eng_nm),
    level: Number.isFinite(level) && level >= 0 && level <= 4 ? level : 0,
    regionType: text(raw.region_ty),
    remark: text(raw.remark),
  };
}

function extractItems(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!isRecord(body)) return [];
  if (Array.isArray(body.data)) return body.data;
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

async function loadDataGoKrRows(key: string): Promise<AlarmRow[]> {
  if (dataGoKrCache && Date.now() - dataGoKrCache.at < CACHE_MS) return dataGoKrCache.rows;

  const params = new URLSearchParams({ serviceKey: key, numOfRows: "300", pageNo: "1", returnType: "JSON" });
  const res = await fetchJson(`${DATA_GO_KR_URL}?${params}`, {}, 20_000, "여행경보(공공데이터포털)").catch(() => null);
  if (!res) throw new ExternalError("UPSTREAM", "공공데이터포털 여행경보 서버에 연결하지 못했습니다.", 502);
  if (!res.ok) throw new ExternalError("UPSTREAM", `공공데이터포털 여행경보 오류 (${res.status})`, 502);

  const rows = extractItems(res.body).map(toAlarmRow).filter((r): r is AlarmRow => r !== null);
  if (rows.length === 0) throw new ExternalError("BAD_OUTPUT", "공공데이터포털 여행경보 목록이 비어 있습니다.", 502);
  dataGoKrCache = { at: Date.now(), rows };
  return rows;
}

async function lookupFromDataGoKr(destination: string, key: string): Promise<TravelAlert> {
  const place = await resolvePlace(destination);
  const rows = await loadDataGoKrRows(key);
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const ko = norm(place.countryKo);
  const en = norm(place.country);
  const matched = rows.filter((r) => (ko && norm(r.countryKo).includes(ko)) || (en && norm(r.countryEn) === en));
  if (matched.length === 0) throw new ExternalError("NOT_FOUND", `"${place.countryKo || destination}"을(를) 목록에서 찾지 못했습니다.`, 404);

  const row = matched.reduce((best, r) => (r.level > best.level ? r : best));
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

/* --------------------------------- 진입점 --------------------------------- */

/** 여행지의 여행경보단계를 조회한다. 키 없이 0404.go.kr을 먼저 쓰고, 실패하면 공공데이터포털(키가 있을 때만)로 넘어간다. */
export async function lookupTravelAlert(destination: string): Promise<TravelAlert> {
  try {
    return await lookupFromMofaSite(destination);
  } catch (primaryErr) {
    const key = readSecret("DATA_GO_KR_KEY");
    if (!key) throw primaryErr;
    try {
      return await lookupFromDataGoKr(destination, key);
    } catch {
      throw primaryErr;
    }
  }
}
