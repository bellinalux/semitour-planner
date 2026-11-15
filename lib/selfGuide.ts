/**
 * 셀프 코스(자유여행·항공+호텔·배낭) 안내 — 장소 사이 이동 방법, 교통패스 추천, 묵기 좋은 구역 (AI 없음).
 * 시간·요금은 어림값이라 화면에 "출발 전 확인"을 붙인다.
 */
import { km } from "@/lib/courseEngine/time";
import type { DayPlan, ItineraryItem } from "@/types";

const hasXY = (i: Pick<ItineraryItem, "lat" | "lng">) => typeof i.lat === "number" && typeof i.lng === "number";

export interface LegHint {
  mode: "walk" | "transit";
  text: string;
  link: string;
}

/** 구글 지도 길찾기 (대중교통·도보) — 좌표가 있으면 좌표로 */
export function directionsLink(a: Pick<ItineraryItem, "name" | "lat" | "lng">, b: Pick<ItineraryItem, "name" | "lat" | "lng">, mode: "transit" | "walking"): string {
  const at = (x: typeof a) => (hasXY(x) ? `${x.lat},${x.lng}` : x.name);
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(at(a))}&destination=${encodeURIComponent(at(b))}&travelmode=${mode}`;
}

/** 다음 장소까지 — 1.2km 안이면 도보(4.5km/h), 아니면 대중교통(지하철·버스, 평균 18km/h + 대기 8분) */
export function legHint(a: ItineraryItem, b: ItineraryItem): LegHint {
  if (hasXY(a) && hasXY(b)) {
    const d = km({ lat: a.lat!, lng: a.lng! }, { lat: b.lat!, lng: b.lng! }) * 1.3;
    if (d < 1.2) return { mode: "walk", text: `도보 약 ${Math.max(3, Math.round((d / 4.5) * 60))}분`, link: directionsLink(a, b, "walking") };
    return { mode: "transit", text: `대중교통 약 ${Math.round((d / 18) * 60 + 8)}분 (지하철·버스 · 택시면 약 ${Math.round((d / 25) * 60 + 5)}분)`, link: directionsLink(a, b, "transit") };
  }
  const m = a.travelMinutesToNext ?? 0;
  return { mode: m <= 10 ? "walk" : "transit", text: m <= 10 ? `도보 약 ${Math.max(3, m)}분` : `대중교통 약 ${m}분`, link: directionsLink(a, b, m <= 10 ? "walking" : "transit") };
}

/** 하루 이동 안내 (관광·식사 사이만, 항공·호텔 줄은 건너뜀) */
export function dayLegs(day: DayPlan): { from: ItineraryItem; to: ItineraryItem; hint: LegHint }[] {
  const stops = day.items.filter((i) => !["flight", "hotel"].includes(i.type ?? ""));
  return stops.slice(1).map((to, k) => ({ from: stops[k], to, hint: legHint(stops[k], to) }));
}

/** 여행지별 교통패스·교통카드 추천 (대표적인 것만 — 일정에 따라 다르니 확인 필요) */
const PASSES: { re: RegExp; text: string }[] = [
  { re: /후쿠오카|규슈|큐슈|벳푸|유후인|나가사키|구마모토|기타큐슈/, text: "JR 규슈 레일패스(북규슈·전규슈) — 도시 사이를 기차로 여러 번 이동할 때 유리 · 시내는 교통카드(스이카 등) 충전" },
  { re: /오사카|교토|고베|나라|간사이/, text: "간사이 지역 패스·간사이 레일웨이 패스 비교 · 시내는 ICOCA(교통카드), 오사카 시내만이면 1일 승차권" },
  { re: /도쿄|요코하마|하코네|닛코/, text: "Suica·PASMO 교통카드 기본, 지하철 위주면 도쿄 서브웨이 티켓(24·48·72시간)" },
  { re: /삿포로|홋카이도|오타루|하코다테/, text: "JR 홋카이도 레일패스(지역별) · 삿포로 시내는 지하철 1일권" },
  { re: /오키나와|나하/, text: "렌터카가 일반적 · 나하 시내는 유이레일 1·2일 승차권" },
  { re: /다낭|호이안|나트랑|호치민|하노이|푸꾸옥|베트남/, text: "그랩(Grab) 앱 택시가 가장 편리 · 호이안 구시가는 도보" },
  { re: /방콕|치앙마이|푸켓|파타야|태국/, text: "방콕 시내는 BTS·MRT(래빗카드) + 그랩 · 섬·근교는 투어 차량" },
  { re: /타이베이|대만|타이중|가오슝/, text: "이지카드(悠遊卡) 교통카드 · 근교(지우펀·예류)는 버스나 1일 투어" },
  { re: /홍콩|마카오/, text: "옥토퍼스 카드 · 마카오는 무료 호텔 셔틀 활용" },
  { re: /세부|보라카이|필리핀/, text: "그랩 택시 · 호핑·섬 이동은 투어 차량" },
  { re: /싱가포르/, text: "교통카드 없이 신용카드 터치(SimplyGo) · MRT 중심" },
  { re: /파리|런던|로마|바르셀로나|유럽|프라하|비엔나/, text: "도시 사이는 기차(유레일 패스 또는 구간권 비교) · 시내는 1일권·교통카드" },
];
export function passAdvice(destination: string): string {
  return PASSES.find((p) => p.re.test(destination))?.text ?? "현지 교통카드와 구글 지도 대중교통 길찾기를 쓰면 편합니다";
}

/** 도시마다 묵기 좋은 구역 — 그날들 장소의 가운데에 가장 가까운 장소 이름 ("○○ 주변") */
export function hotelAreas(days: DayPlan[]): { city: string; near: string }[] {
  const byCity = new Map<string, ItineraryItem[]>();
  for (const d of days) {
    const city = (d.overnightCity ?? "").trim();
    if (!city) continue;
    const pts = d.items.filter((i) => hasXY(i) && !["flight", "hotel"].includes(i.type ?? ""));
    byCity.set(city, [...(byCity.get(city) ?? []), ...pts]);
  }
  const out: { city: string; near: string }[] = [];
  for (const [city, pts] of byCity) {
    if (pts.length < 2) continue;
    const c = { lat: pts.reduce((s, p) => s + p.lat!, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng!, 0) / pts.length };
    const near = pts.reduce((best, p) => (km(c, { lat: p.lat!, lng: p.lng! }) < km(c, { lat: best.lat!, lng: best.lng! }) ? p : best));
    out.push({ city, near: near.name });
  }
  return out;
}
