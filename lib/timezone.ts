import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 시차·노선 비행시간 — 항공 항목의 "다음까지 이동"은 현지 시각 차이(실제 비행시간 + 시차)다.
 * 도착 시각을 모르는 항공(업체 코스표·추정)은 노선 비행시간표와 시차표로 현지 도착 시각을 계산하고,
 * 일정표에서 공항 이름을 바꾸면 그 노선으로 다시 계산한다. 시각 앞에는 그 시각의 나라를 붙여 시차를 보이게 한다.
 * 비행시간은 직항 기준 대략값(추정)이고, 실제 항공편을 적용하면 그 시각이 우선한다.
 */

export interface Zone {
  /** 나라 이름 (시각 앞 표시) */
  country: string;
  /** 표준시 UTC 기준 시간 */
  offset: number;
  /** 서머타임 규칙 */
  dst?: "eu" | "us" | "au";
  /** 비행시간표 열쇠 (도시·지역) */
  key: string;
}

/** 이름에서 찾는 순서가 중요하다 — 구체적인 것(발리·하와이)을 나라 이름보다 먼저 */
const ZONES: [RegExp, Zone][] = [
  [/인천|ICN|서울/i, { country: "한국", offset: 9, key: "인천" }],
  [/김포|GMP/i, { country: "한국", offset: 9, key: "김포" }],
  [/김해|부산|PUS/i, { country: "한국", offset: 9, key: "김해" }],
  [/제주|CJU/i, { country: "한국", offset: 9, key: "제주" }],
  [/대구|TAE/i, { country: "한국", offset: 9, key: "대구" }],
  [/청주|CJJ/i, { country: "한국", offset: 9, key: "청주" }],
  [/무안|광주|MWX/i, { country: "한국", offset: 9, key: "무안" }],
  [/양양|YNY/i, { country: "한국", offset: 9, key: "양양" }],
  [/한국|국내/, { country: "한국", offset: 9, key: "인천" }],
  [/발리|덴파사르|DPS/i, { country: "인도네시아", offset: 8, key: "발리" }],
  [/자카르타|CGK/i, { country: "인도네시아", offset: 7, key: "자카르타" }],
  [/방콕|수안나품|돈므앙|BKK|DMK|파타야/i, { country: "태국", offset: 7, key: "방콕" }],
  [/푸켓|HKT|끄라비/i, { country: "태국", offset: 7, key: "푸켓" }],
  [/치앙마이|CNX/i, { country: "태국", offset: 7, key: "치앙마이" }],
  [/코사무이|USM/i, { country: "태국", offset: 7, key: "코사무이" }],
  [/태국/, { country: "태국", offset: 7, key: "방콕" }],
  [/다낭|DAD|호이안/i, { country: "베트남", offset: 7, key: "다낭" }],
  [/하노이|HAN|하롱/i, { country: "베트남", offset: 7, key: "하노이" }],
  [/호치민|SGN|사이공/i, { country: "베트남", offset: 7, key: "호치민" }],
  [/나트랑|냐짱|깜란|CXR/i, { country: "베트남", offset: 7, key: "나트랑" }],
  [/푸꾸옥|PQC/i, { country: "베트남", offset: 7, key: "푸꾸옥" }],
  [/달랏|DLI/i, { country: "베트남", offset: 7, key: "달랏" }],
  [/베트남/, { country: "베트남", offset: 7, key: "다낭" }],
  [/비엔티안|VTE|루앙프라방|방비엥|라오스/i, { country: "라오스", offset: 7, key: "비엔티안" }],
  [/씨엠립|시엠립|REP|SAI|프놈펜|캄보디아/i, { country: "캄보디아", offset: 7, key: "씨엠립" }],
  [/세부|CEB|보홀/i, { country: "필리핀", offset: 8, key: "세부" }],
  [/마닐라|MNL/i, { country: "필리핀", offset: 8, key: "마닐라" }],
  [/보라카이|칼리보|KLO|까띠끌란/i, { country: "필리핀", offset: 8, key: "보라카이" }],
  [/클락|CRK/i, { country: "필리핀", offset: 8, key: "클락" }],
  [/필리핀/, { country: "필리핀", offset: 8, key: "세부" }],
  [/코타키나발루|BKI/i, { country: "말레이시아", offset: 8, key: "코타키나발루" }],
  [/쿠알라|KUL|말레이시아|랑카위|페낭/i, { country: "말레이시아", offset: 8, key: "쿠알라룸푸르" }],
  [/싱가포르|SIN|창이/i, { country: "싱가포르", offset: 8, key: "싱가포르" }],
  [/홍콩|HKG/i, { country: "홍콩", offset: 8, key: "홍콩" }],
  [/마카오|MFM/i, { country: "마카오", offset: 8, key: "마카오" }],
  [/타이베이|TPE|타오위안|대만|가오슝|KHH|타이중/i, { country: "대만", offset: 8, key: "타이베이" }],
  [/상하이|푸동|PVG/i, { country: "중국", offset: 8, key: "상하이" }],
  [/베이징|PEK|PKX/i, { country: "중국", offset: 8, key: "베이징" }],
  [/칭다오|TAO/i, { country: "중국", offset: 8, key: "칭다오" }],
  [/장가계|DYG/i, { country: "중국", offset: 8, key: "장가계" }],
  [/중국/, { country: "중국", offset: 8, key: "상하이" }],
  [/울란바토르|몽골|UBN/i, { country: "몽골", offset: 8, key: "울란바토르" }],
  [/도쿄|나리타|하네다|NRT|HND/i, { country: "일본", offset: 9, key: "도쿄" }],
  [/오사카|간사이|KIX|교토|고베/i, { country: "일본", offset: 9, key: "오사카" }],
  [/후쿠오카|FUK|규슈|큐슈|유후인|벳푸/i, { country: "일본", offset: 9, key: "후쿠오카" }],
  [/삿포로|치토세|CTS|홋카이도|북해도/i, { country: "일본", offset: 9, key: "삿포로" }],
  [/오키나와|나하|OKA/i, { country: "일본", offset: 9, key: "오키나와" }],
  [/나고야|NGO/i, { country: "일본", offset: 9, key: "나고야" }],
  [/일본/, { country: "일본", offset: 9, key: "오사카" }],
  [/괌|GUM/i, { country: "괌", offset: 10, key: "괌" }],
  [/사이판|SPN/i, { country: "사이판", offset: 10, key: "사이판" }],
  [/하와이|호놀룰루|HNL/i, { country: "미국(하와이)", offset: -10, key: "하와이" }],
  [/로스앤젤레스|LAX|샌프란시스코|SFO|시애틀|라스베이거스|미국\s*서부/i, { country: "미국", offset: -8, dst: "us", key: "로스앤젤레스" }],
  [/뉴욕|JFK|미국\s*동부|워싱턴/i, { country: "미국", offset: -5, dst: "us", key: "뉴욕" }],
  [/시드니|SYD|멜버른|호주/i, { country: "호주", offset: 10, dst: "au", key: "시드니" }],
  [/이스탄불|IST|튀르키예|터키|카파도키아/i, { country: "튀르키예", offset: 3, key: "이스탄불" }],
  [/런던|LHR|영국|에든버러/i, { country: "영국", offset: 0, dst: "eu", key: "런던" }],
  [/리스본|LIS|포르투갈|포르투/i, { country: "포르투갈", offset: 0, dst: "eu", key: "리스본" }],
  [/아테네|ATH|그리스|산토리니|헬싱키|핀란드/i, { country: "그리스·핀란드", offset: 2, dst: "eu", key: "아테네" }],
  [/파리|CDG|프랑스|니스/i, { country: "프랑스", offset: 1, dst: "eu", key: "파리" }],
  [/로마|FCO|이탈리아|밀라노|MXP|베니스|베네치아|피렌체|나폴리/i, { country: "이탈리아", offset: 1, dst: "eu", key: "로마" }],
  [/바르셀로나|BCN|마드리드|MAD|스페인/i, { country: "스페인", offset: 1, dst: "eu", key: "바르셀로나" }],
  [/프랑크푸르트|FRA|뮌헨|MUC|독일|베를린/i, { country: "독일", offset: 1, dst: "eu", key: "프랑크푸르트" }],
  [/취리히|ZRH|스위스|인터라켄/i, { country: "스위스", offset: 1, dst: "eu", key: "취리히" }],
  [/비엔나|VIE|오스트리아|프라하|PRG|체코|부다페스트|BUD|헝가리|크로아티아|자그레브|두브로브니크/i, { country: "중부유럽", offset: 1, dst: "eu", key: "프라하" }],
  [/암스테르담|AMS|네덜란드|브뤼셀|벨기에|코펜하겐|덴마크|오슬로|노르웨이|스톡홀름|스웨덴/i, { country: "서북유럽", offset: 1, dst: "eu", key: "파리" }],
];

/** 이름·도시에서 시간대 (모르면 null) */
export function zoneOf(text: string): Zone | null {
  for (const [re, z] of ZONES) if (re.test(text)) return z;
  return null;
}

/** 서머타임 적용 여부 (날짜를 모르면 표준시) */
function inDst(rule: Zone["dst"], date: string | undefined): boolean {
  if (!rule || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return Date.UTC(y, month, 1 + ((7 - first) % 7) + (n - 1) * 7);
  };
  const lastSunday = (month: number) => {
    const last = new Date(Date.UTC(y, month + 1, 0));
    return Date.UTC(y, month, last.getUTCDate() - last.getUTCDay());
  };
  if (rule === "eu") return t >= lastSunday(2) && t < lastSunday(9);
  if (rule === "us") return t >= nthSunday(2, 2) && t < nthSunday(10, 1);
  return t >= nthSunday(9, 1) || t < nthSunday(3, 1); // 남반구 (10월 첫 일요일 ~ 4월 첫 일요일)
}

/** 그 날짜의 UTC 기준 시간 */
export function offsetOn(z: Zone, date?: string): number {
  return z.offset + (inDst(z.dst, date) ? 1 : 0);
}

/** 받침이 있으면 "과", 없으면 "와" */
const withGwa = (word: string) => {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0 ? "과" : "와";
};

/** "한국보다 2시간 느림" */
export function diffText(from: Zone, to: Zone, date?: string): string {
  const h = offsetOn(to, date) - offsetOn(from, date);
  if (h === 0) return `${from.country}${withGwa(from.country)} 시차 없음`;
  const v = Math.abs(h);
  return `${from.country}보다 ${Number.isInteger(v) ? v : v.toFixed(1)}시간 ${h < 0 ? "느림" : "빠름"}`;
}

/** 한국에서 가는 직항 대략 비행시간(분, 인천 기준) — 추정값, 실제 항공편이 우선 */
const FROM_KOREA: Record<string, number> = {
  방콕: 360, 푸켓: 390, 치앙마이: 350, 코사무이: 380,
  다낭: 280, 하노이: 280, 호치민: 320, 나트랑: 310, 푸꾸옥: 350, 달랏: 320,
  비엔티안: 320, 씨엠립: 330,
  세부: 270, 마닐라: 240, 보라카이: 260, 클락: 230,
  코타키나발루: 300, 쿠알라룸푸르: 390, 싱가포르: 380, 발리: 420, 자카르타: 420,
  홍콩: 220, 마카오: 225, 타이베이: 150, 상하이: 120, 베이징: 130, 칭다오: 100, 장가계: 210, 울란바토르: 210,
  도쿄: 140, 오사카: 110, 후쿠오카: 80, 삿포로: 170, 오키나와: 140, 나고야: 115,
  괌: 270, 사이판: 260, 하와이: 510, 로스앤젤레스: 660, 뉴욕: 840, 시드니: 630,
  이스탄불: 750, 런던: 860, 리스본: 870, 아테네: 780, 파리: 820, 로마: 820, 바르셀로나: 840, 프랑크푸르트: 800, 취리히: 800, 프라하: 780,
};
/** 인천이 아닌 국내 공항에서 — 남쪽 공항은 동남아·일본이 조금 짧다 (분) */
const KOREA_AIRPORT_ADJUST: Record<string, number> = { 인천: 0, 김포: 0, 청주: 0, 양양: 0, 대구: -10, 무안: -10, 김해: -20, 제주: -20 };
const SOUTH_OR_JAPAN = new Set(["일본", "대만", "필리핀", "베트남", "태국", "말레이시아", "싱가포르", "인도네시아", "라오스", "캄보디아", "홍콩", "마카오", "괌", "사이판"]);

/** 노선 대략 비행시간(분) — 한국 ↔ 해외만 (모르면 null). 돌아오는 편은 편서풍으로 동남아 −20분, 그 밖 장거리 −60분 */
export function flightMinutes(from: Zone, to: Zone): number | null {
  const outbound = from.country === "한국" && to.country !== "한국";
  const inbound = to.country === "한국" && from.country !== "한국";
  if (!outbound && !inbound) return null;
  const korea = outbound ? from : to;
  const abroad = outbound ? to : from;
  const base = FROM_KOREA[abroad.key];
  if (base === undefined) return null;
  const adjust = SOUTH_OR_JAPAN.has(abroad.country) ? (KOREA_AIRPORT_ADJUST[korea.key] ?? 0) : 0;
  const back = inbound ? (base >= 600 ? -60 : -20) : 0;
  return Math.max(40, Math.round((base + adjust + back) / 5) * 5);
}

/** "5시간 40분" */
export const hm = (m: number) => {
  const h = Math.floor(Math.abs(m) / 60);
  const r = Math.abs(m) % 60;
  return `${h > 0 ? `${h}시간` : ""}${h > 0 && r > 0 ? " " : ""}${r > 0 || h === 0 ? `${r}분` : ""}`;
};

/** 그날 출발 항공과 바로 다음 도착 항공 */
function legOf(items: ItineraryItem[]): { dep: ItineraryItem; arr: ItineraryItem } | null {
  const i = items.findIndex((x) => x.type === "flight");
  if (i < 0 || items[i + 1]?.type !== "flight") return null;
  return { dep: items[i], arr: items[i + 1] };
}

/**
 * 출발·도착 공항 이름으로 비행시간을 다시 계산한다 — 출발 항목의 "다음까지 이동" = 비행시간 + 시차(현지 시각 차이),
 * 출발 항목에 비행 정보(flightInfo)를 남긴다. 실제 항공편을 적용해 비행 정보가 확인된 경우(estimated false)는 그대로 둔다.
 * force: 공항 이름을 바꿨을 때처럼 확인된 정보도 다시 계산한다.
 */
export function recalcFlightDay(day: DayPlan, date?: string, force = false): DayPlan {
  if (day.kind !== "linear") return day;
  const leg = legOf(day.items);
  if (!leg) return day;
  if (leg.dep.flightInfo && !leg.dep.flightInfo.estimated && !force) return day;
  // 예전에 실제 항공편을 적용한 항목(설명에 "HH:mm 도착"이 적힌 것)은 확인된 시각이라 그대로 둔다
  if (!leg.dep.flightInfo && !force && /\d{1,2}:\d{2}\s*도착/.test(leg.dep.description ?? "")) return day;
  const from = zoneOf(leg.dep.name);
  const to = zoneOf(leg.arr.name);
  if (!from || !to) return day;
  const minutes = flightMinutes(from, to);
  if (minutes === null) return day;
  const tz = Math.round((offsetOn(to, date) - offsetOn(from, date)) * 60);
  const local = minutes + tz;
  if (leg.dep.travelMinutesToNext === local && leg.dep.flightInfo?.minutes === minutes && leg.dep.flightInfo?.tzMinutes === tz) return day;
  return {
    ...day,
    items: day.items.map((i) => (i.id === leg.dep.id ? { ...i, travelMinutesToNext: local, flightInfo: { minutes, tzMinutes: tz, estimated: true } } : i)),
  };
}

/** 일정 전체 — 가는 편(첫날)·오는 편(마지막 항공일) */
export function recalcFlights(days: DayPlan[], departureDate?: string): DayPlan[] {
  const next = days.map((d, i) => recalcFlightDay(d, dateOfDay(departureDate, i)));
  return next.some((d, i) => d !== days[i]) ? next : days;
}

export function dateOfDay(departureDate: string | undefined, index: number): string | undefined {
  if (!departureDate || !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) return undefined;
  const [y, m, d] = departureDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + index)).toISOString().slice(0, 10);
}

/**
 * 항목마다 그 시각의 나라 — 항공이 있는 날은 출발 전은 출발 나라, 도착 뒤는 도착 나라.
 * 항공이 없는 날은 여행지(숙박 도시) 나라. 모르면 맵에 없다.
 */
export function zonesOfDay(day: DayPlan, items: ItineraryItem[], destination: string): Map<string, Zone> {
  const out = new Map<string, Zone>();
  const local = zoneOf(`${day.overnightCity ?? ""} ${destination}`);
  const leg = legOf(items);
  if (!leg) {
    if (local) for (const i of items) out.set(i.id, local);
    return out;
  }
  const from = zoneOf(leg.dep.name);
  const to = zoneOf(leg.arr.name) ?? local;
  let after = false;
  for (const i of items) {
    if (i === leg.arr) after = true;
    const z = after ? to : from;
    if (z) out.set(i.id, z);
  }
  return out;
}

/** 국내 공항 이름 (출발지 입력과 견주기) — 모르면 null */
export function koreanAirport(text: string): string | null {
  const z = zoneOf(text);
  return z && z.country === "한국" ? z.key : null;
}
