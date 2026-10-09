/**
 * 방문지 이름 비교 — 투어 비교표(겹치는 방문지)와 예산 맞추기(대표 일정 보호)에서 쓴다.
 * "바나힐" = "바나 힐 테마파크" = "Ba Na Hills(바나힐)"처럼 띄어쓰기·괄호 속 다른 표기·덧붙인 말이 달라도 같은 곳으로 본다.
 * 다만 "야시장"·"시내 관광"처럼 어디에나 붙는 일반 이름은 정확히 같을 때만 같은 곳으로 본다 ("야시장" ≠ "호이안 야시장").
 */

/** 비교용 키 (괄호·띄어쓰기·기호를 빼고 소문자로) */
export function placeKey(name: string): string {
  return name
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[\s·・,./\-_'"’&]/g, "")
    .toLowerCase();
}

/** 장소 이름 뒤에 붙는 덧말 — "베네시안 리조트" = "베네시안 호텔 관광 및 카지노 체험" (3글자 이상 남을 때만 쓴다) */
const SUFFIX_WORDS = /리조트|호텔|관광|투어|체험|카지노|방문|구경|및|resort|hotel|tour/gi;

/** 한 이름의 여러 표기 — 본 이름, 괄호 속 표기, 슬래시로 나눈 표기, 덧말을 뺀 이름 */
export function placeAliases(name: string): string[] {
  const inner = [...name.matchAll(/\((.*?)\)|\[(.*?)\]/g)].map((m) => m[1] ?? m[2] ?? "");
  const parts = [name, ...inner, ...name.split("/")];
  const keys = parts.map(placeKey).filter((k) => k.length >= 2);
  const core = keys.map((k) => k.replace(SUFFIX_WORDS, "")).filter((k) => k.length >= 3 && !GENERIC.has(k));
  return [...new Set([...keys, ...core])];
}

/** 어디에나 붙는 일반 이름 — 포함 관계로는 같은 곳이라고 하지 않는다 */
const GENERIC = new Set(
  [
    "야시장",
    "시장",
    "시내",
    "시내관광",
    "시내투어",
    "시티투어",
    "야경",
    "야경투어",
    "마사지",
    "쇼핑",
    "자유시간",
    "자유일정",
    "해변",
    "비치",
    "공항",
    "호텔",
    "리조트",
    "사원",
    "성당",
    "박물관",
    "공원",
    "전망대",
    "카페",
    "온천",
    "night market",
    "market",
    "beach",
    "temple",
    "museum",
  ].map(placeKey),
);

function keysMatch(x: string, y: string): boolean {
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  // 짧은 이름이 일반 이름이거나 너무 짧으면(2글자 이하) 포함 관계로 보지 않는다
  if (short.length < 3 || GENERIC.has(short)) return false;
  return long.includes(short);
}

/** 두 이름이 같은 곳으로 보이는지 */
export function samePlace(a: string, b: string): boolean {
  const xs = placeAliases(a);
  const ys = placeAliases(b);
  return xs.some((x) => ys.some((y) => keysMatch(x, y)));
}
