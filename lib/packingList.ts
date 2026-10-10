import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { SeasonResponse } from "@/lib/schemas/season";
import type { TravelInfo } from "@/lib/schemas/travelInfo";
import type { DayPlan, TripInput } from "@/types";

/**
 * 고객용 준비물 — 기본(여권·보험·상비약) + 여행 정보(전압·입국)·출발 시기(날씨) + 일정 내용(수영·트레킹·사원)으로 고른다.
 * 출발 전 안내문·웹 일정표·인쇄에 같이 쓴다.
 */

export interface PackingGroup {
  title: string;
  items: string[];
}

const has = (text: string, re: RegExp) => re.test(text);

export function packingList(input: TripInput, days: DayPlan[], pmChoice: PmChoice, info?: TravelInfo | null, season?: SeasonResponse | null): PackingGroup[] {
  const overseas = input.tripScope !== "domestic";
  const all = days.flatMap((d) => dayItems(d, pmChoice));
  const text = all.map((i) => `${i.name} ${i.description} ${i.caution ?? ""}`).join(" ");
  const weather = `${info?.weather ?? ""} ${season?.weather ?? ""} ${(season?.notes ?? []).map((n) => `${n.title} ${n.detail}`).join(" ")}`;
  const temps = [...weather.matchAll(/(-?\d{1,2})\s*(?:~|-|–)?\s*(-?\d{1,2})?\s*(?:도|℃|°C)/g)].flatMap((m) => [m[1], m[2]].filter(Boolean).map(Number));
  const hot = temps.some((t) => t >= 28) || has(weather, /덥|무더|폭염|여름|건기/);
  const cold = temps.some((t) => t <= 10) || has(weather, /춥|쌀쌀|겨울|눈|영하|한파/);
  const rain = has(weather, /비|우기|강수|장마|태풍|소나기|우산/);

  const docs = [
    ...(overseas ? ["여권 (출발일 기준 유효기간 6개월 이상) · 여권 사본 1부"] : ["신분증"]),
    ...(input.packageType === "full" ? ["항공권(전자 항공권) — 출발 전 문자·메일로 받은 것"] : []),
    ...(overseas && info?.visa && has(info.visa, /사전|전자|입국 ?신고|e-?arrival|eTA|ETA|비자/i) ? [`입국 서류: ${info.visa}`] : []),
    "여행자보험 가입 확인서 (가입했다면)",
    "비상연락처 메모 (여행사·현지 가이드)",
  ];
  const money = [
    ...(overseas ? [`현지 통화 소액${info?.currency ? ` (${info.currency})` : ""}`, "해외 결제 가능한 카드"] : ["카드·교통카드"]),
    ...(input.tipPerPerson <= 0 && overseas ? ["가이드·기사 경비 (현지 지불분)"] : []),
    ...(all.some((i) => i.payment === "local") ? ["현지 지불 일정 비용 (일정표 '현지 지불 안내' 참고)"] : []),
  ];
  const electronics = [
    "휴대폰 충전기 · 보조배터리 (기내 반입만 가능)",
    // 한국과 같은 220V C·F형이 아니면(또는 모르면) 멀티 어댑터
    // 플러그 표기 "A·C타입", "A/C형", "G 타입"에서 A·B·G·I 형이 하나라도 있으면 (한국 C·F형 플러그가 안 맞는 곳이 있다)
    ...(overseas && (!info?.voltage || /어댑터|110|120/.test(info.voltage) || /(^|[^A-Za-z])[ABGI](?=[^A-Za-z]|$)/.test(info.voltage) || !/C|F/.test(info.voltage)) ? [`멀티 어댑터${info?.voltage ? ` (${info.voltage})` : ""}`] : []),
    ...(overseas ? ["데이터 로밍·유심·이심 준비"] : []),
  ];
  const clothes = [
    "편한 운동화 (하루 걷는 시간이 깁니다)",
    ...(hot ? ["모자 · 선글라스 · 선크림", "얇고 통풍 잘 되는 옷"] : []),
    ...(cold ? ["두꺼운 겉옷 · 장갑 · 목도리"] : []),
    ...(!hot && !cold ? ["아침저녁용 얇은 겉옷"] : []),
    ...(rain ? ["접이식 우산 또는 우비"] : []),
    ...(has(text, /수영|해변|비치|스노클|물놀이|워터|풀빌라|온천|스파/) ? ["수영복 · 아쿠아슈즈 · 방수팩"] : []),
    ...(has(text, /트레킹|등산|하이킹|산행|협곡|오름|정상/) ? ["등산화 또는 접지 좋은 운동화 · 물병"] : []),
    ...(has(text, /사원|성당|사찰|모스크|왕궁|궁전|사당|템플|temple|mosque/i) ? ["사원·왕궁 입장용 어깨·무릎 가리는 옷"] : []),
    ...(has(text, /야경|크루즈|야시장|야간|밤/) ? ["저녁 바닷바람·에어컨용 얇은 겉옷"] : []),
  ];
  const health = ["상비약 (소화제·진통제·밴드·멀미약)", "개인 복용약 (처방전 영문 사본이 있으면 좋습니다)", ...(hot || has(text, /정글|열대|강|호수/) ? ["모기 기피제"] : [])];

  return [
    { title: "서류", items: docs },
    { title: "돈 · 결제", items: money },
    { title: "전자기기", items: electronics },
    { title: "옷 · 신발", items: clothes },
    { title: "건강", items: health },
  ].map((g) => ({ ...g, items: [...new Set(g.items)] }));
}

export function packingText(groups: PackingGroup[]): string {
  return groups.map((g) => [`[${g.title}]`, ...g.items.map((i) => `☐ ${i}`)].join("\n")).join("\n\n");
}
