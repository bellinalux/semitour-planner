import { calcDayEnd, dayMeetingTime, DEFAULT_MEETING_TIME, formatClock, morningFreeItems, parseClock, walkTimeline, dayTourStart } from "@/lib/dayLoad";
import { dayIntensity } from "@/lib/intensity";
import { refitDay } from "@/lib/dayBalance";
import { fixDayStructure } from "@/lib/dayStructure";
import { dayWindow, fixImpossible } from "@/lib/feasibility";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { isRestStop } from "@/lib/mealTiming";
import type { Companion, DayPlan, ItineraryItem, OperatingModel, ProductTier, TourOption, TripInput } from "@/types";

/**
 * 패키지 규칙표 — 업계(대형 여행사 등급 체계·패키지 유형·표준약관·정보제공 표준안·운전 규정) 조사로 만든 기본값.
 * 상품은 세 축의 조합이다: ① 운영 방식(가이드·차량이 얼마나 붙나) × ② 등급(쇼핑·옵션·팁·호텔·식사·여유) × ③ 고객 유형(걷는 양·휴식·출발 시각).
 * 여기에 지역(동남아 저녁 일정, 유럽·일본 운전 규정) 차이를 더한다.
 * AI 일정 지시문, 일정 카드 점검, 상품 규칙 점검이 모두 이 표 하나를 읽는다.
 * 수치 중 출처가 없는 것은 업계 관행에서 정한 기본값이다.
 */

export const OPERATING_MODELS: { id: OperatingModel; label: string; hint: string }[] = [
  { id: "full", label: "풀패키지", hint: "전 일정 가이드·전용차량, 하루 4~6곳, 3식 포함" },
  { id: "semi", label: "세미패키지", hint: "일부 일정만 가이드, 오후·저녁 또는 1~2일 자유 (전체의 20~40%)" },
  { id: "private", label: "단독(프라이빗)", hint: "우리 일행만 전용차량+전담 가이드, 미팅 시각 선택, 하루 3~4곳" },
  { id: "small_group", label: "소규모 그룹", hint: "리더 1명·최대 12~16명, 중심가 숙박, 자유시간 많음" },
  { id: "backpack", label: "단체배낭", hint: "인솔자 동행·대중교통, 오전 1~2곳 뒤 자유, 조식만, 도시당 2~3박" },
  { id: "airtel", label: "에어텔·호텔팩", hint: "항공+호텔(+패스)만, 일정은 전일 자유 (추천 코스는 참고용)" },
];

export const PRODUCT_TIERS: { id: ProductTier; label: string; hint: string }[] = [
  { id: "value", label: "실속", hint: "쇼핑·선택관광 있음, 가이드 경비 별도 (하나투어 세이브 급)" },
  { id: "standard", label: "스탠다드", hint: "노쇼핑 또는 1~2회, 노팁, 선택관광은 합리적 가격 (하나팩 스탠다드·모두시그니처 급)" },
  { id: "premium", label: "프리미엄", hint: "노쇼핑·노옵션·노팁, 4~5성 연박, 특식 2회 이상, 09:00 이후 출발" },
  { id: "signature", label: "시그니처", hint: "프리미엄 + 이동일도 09:00 이후, 2~3연박, 특색 숙소·특별 식사·대표 체험 1회씩" },
];

export type Region = "sea" | "japan" | "europe" | "korea" | "other";
export const REGION_LABEL: Record<Region, string> = { sea: "동남아·중화권", japan: "일본", europe: "유럽·튀르키예", korea: "국내", other: "기타 지역" };

const SEA = /태국|방콕|파타야|푸켓|치앙마이|끄라비|코사무이|베트남|다낭|호이안|하노이|하롱|호치민|나트랑|냐짱|푸꾸옥|달랏|필리핀|세부|보라카이|마닐라|보홀|팔라완|말레이시아|코타키나발루|쿠알라|랑카위|페낭|인도네시아|발리|자카르타|싱가포르|캄보디아|씨엠립|시엠립|프놈펜|라오스|비엔티안|루앙프라방|방비엥|미얀마|마카오|홍콩|대만|타이베이|타이중|가오슝|괌|사이판/;
const JAPAN = /일본|도쿄|오사카|교토|나라|고베|후쿠오카|삿포로|홋카이도|북해도|오키나와|나고야|규슈|큐슈|벳푸|유후인|하코네|가나자와|다카야마|시즈오카|센다이|히로시마|구마모토|가고시마|나가사키|료칸/;
const EUROPE = /유럽|이탈리아|로마|피렌체|베니스|베네치아|밀라노|나폴리|프랑스|파리|니스|스위스|인터라켄|취리히|루체른|융프라우|독일|뮌헨|베를린|프랑크푸르트|오스트리아|비엔나|빈|잘츠부르크|체코|프라하|체스키|헝가리|부다페스트|스페인|바르셀로나|마드리드|세비야|그라나다|포르투갈|리스본|포르투|영국|런던|에든버러|네덜란드|암스테르담|벨기에|브뤼셀|크로아티아|두브로브니크|자그레브|슬로베니아|그리스|아테네|산토리니|튀르키예|터키|이스탄불|카파도키아|발칸|북유럽|노르웨이|스웨덴|덴마크|핀란드|아이슬란드/;

/** 여행지·숙박 도시로 지역을 정한다 (국내여행이면 국내) */
export function regionOf(destination: string, tripScope: TripInput["tripScope"], cities: string[] = []): Region {
  if (tripScope === "domestic") return "korea";
  const text = [destination, ...cities].join(" ");
  if (SEA.test(text)) return "sea";
  if (JAPAN.test(text)) return "japan";
  if (EUROPE.test(text)) return "europe";
  return "other";
}

export interface PackageRules {
  model: OperatingModel;
  tier: ProductTier;
  region: Region;
  /** "풀패키지 · 프리미엄 · 시니어" */
  label: string;
  /** AI가 만들 기본 하루 구성 */
  dayStyle: "full" | "semi" | "free";
  /** 기본 미팅 시각 / 이보다 이르면 경고 */
  meeting: string;
  earliestMeeting: string;
  /** 하루 방문 장소(관광·체험·쇼핑·마사지) 수 [권장 최소, 최대] / 첫날 최대 */
  placesPerDay: [number, number];
  firstDayMax: number;
  /** 반나절 이상 자유의 비중(투어일 기준) [최소, 최대] — 반나절 0.5일, 전일 1일 */
  freeShare: [number, number];
  /** 한 번 차량 이동 상한(분) */
  maxRideMinutes: number;
  /** 하루 걷기 상한(km), 없으면 null */
  walkKmMax: number | null;
  /** 하루 종료 기준 시각 (지역·고객 반영) / 저녁 일정 정상 여부 */
  dayEnd: string;
  eveningOk: boolean;
  /** 식사 원칙 (사람이 읽는 말) / 특식 최소 횟수 */
  meals: string;
  specialMealsMin: number;
  /** 한 숙소 최소 연박 (1이면 제한 없음) */
  minNightsPerHotel: number;
  /** 쇼핑센터 최대 횟수 (null = 제한 없음, 0 = 노쇼핑) / 하루 최대 1회, 첫날·출국 직전 피함 */
  shoppingMax: number | null;
  /** 선택관광: 있음 / 합리적 가격 / 주요 옵션 포함(노옵션) / 없음 */
  options: "allowed" | "reasonable" | "included" | "none";
  /** 가이드·기사 경비 포함(노팁) */
  tipsIncluded: boolean;
  /** 시그니처 필수 요소 (특색 숙소·특별 장소 식사·대표 체험) */
  signatureItems: boolean;
  /** 운전 규정 — 연속 운전 상한·휴식(분), 하루 운전 상한(분), 근거 */
  driving: { continuous: number; rest: number; daily: number | null; basis: string };
  /** 호텔 체크인 기준 시각 / 국제선 공항 도착(출발 몇 분 전) */
  checkIn: string;
  airportBefore: number;
  /** 사람이 읽는 규칙 문장 (화면·AI 지시문) */
  notes: string[];
}

const minClock = (a: string, b: string) => ((parseClock(a) ?? 0) <= (parseClock(b) ?? 0) ? a : b);
const maxClock = (a: string, b: string) => ((parseClock(a) ?? 0) >= (parseClock(b) ?? 0) ? a : b);

type Base = Omit<PackageRules, "tier" | "region" | "label" | "shoppingMax" | "options" | "tipsIncluded" | "signatureItems" | "specialMealsMin" | "driving" | "checkIn" | "airportBefore" | "dayEnd" | "eveningOk">;

const BASE: Record<OperatingModel, Base> = {
  full: {
    model: "full", dayStyle: "full", meeting: "08:30", earliestMeeting: "08:00", placesPerDay: [4, 6], firstDayMax: 3, freeShare: [0, 0.2], maxRideMinutes: 180, walkKmMax: null,
    meals: "3식 포함 (조식 호텔식 · 중식 현지식 · 석식 현지식/특식)", minNightsPerHotel: 1,
    notes: ["전 일정 가이드·전용차량, 관광지마다 30분~1시간 30분", "쇼핑 횟수·선택관광(요금·대체일정)을 일정표에 꼭 표기"],
  },
  semi: {
    model: "semi", dayStyle: "semi", meeting: "09:00", earliestMeeting: "08:30", placesPerDay: [2, 5], firstDayMax: 3, freeShare: [0.2, 0.5], maxRideMinutes: 150, walkKmMax: null,
    meals: "가이드 일정의 중식 포함, 자유 시간대는 자유식", minNightsPerHotel: 2,
    notes: ["관광일은 오전 2~3곳 뒤 오후·저녁 자유, 또는 관광일+전일 자유일 섞기 (자유가 전체의 20~40%)", "도심·역세권 숙소 연박"],
  },
  private: {
    model: "private", dayStyle: "full", meeting: "09:00", earliestMeeting: "08:30", placesPerDay: [3, 4], firstDayMax: 2, freeShare: [0, 0.4], maxRideMinutes: 180, walkKmMax: null,
    meals: "일행과 협의 (현지 맛집 실명 표기)", minNightsPerHotel: 1,
    notes: ["우리 일행만 전용차량+전담 가이드 — 일정표에 명시", "미팅 시각·순서는 일행에 맞춰 조정 가능하다고 안내"],
  },
  small_group: {
    model: "small_group", dayStyle: "full", meeting: "09:00", earliestMeeting: "08:30", placesPerDay: [3, 4], firstDayMax: 2, freeShare: [0.15, 0.5], maxRideMinutes: 180, walkKmMax: null,
    meals: "일부 포함, 나머지 자유식", minNightsPerHotel: 2,
    notes: ["리더 1명·최대 12~16명", "중심가 숙박, 자유시간 넉넉히"],
  },
  backpack: {
    model: "backpack", dayStyle: "semi", meeting: "09:00", earliestMeeting: "08:30", placesPerDay: [1, 3], firstDayMax: 2, freeShare: [0.4, 1], maxRideMinutes: 240, walkKmMax: null,
    meals: "조식만 포함, 중식·석식은 자유식", minNightsPerHotel: 2,
    notes: ["인솔자가 오전 핵심 1~2곳 안내 뒤 자유, 대중교통·기차 이동", "도시당 2~3박, 도시 사이 이동은 반나절"],
  },
  airtel: {
    model: "airtel", dayStyle: "free", meeting: "09:00", earliestMeeting: "00:00", placesPerDay: [0, 0], firstDayMax: 0, freeShare: [1, 1], maxRideMinutes: 600, walkKmMax: null,
    meals: "조식만 포함", minNightsPerHotel: 1,
    notes: ["일정표에는 항공·호텔·패스만, 나머지는 전일 자유일정", "추천 코스는 '참고용'으로 따로 표시"],
  },
};

const TIER: Record<ProductTier, Pick<PackageRules, "shoppingMax" | "options" | "tipsIncluded" | "specialMealsMin" | "signatureItems"> & { note: string }> = {
  value: { shoppingMax: null, options: "allowed", tipsIncluded: false, specialMealsMin: 0, signatureItems: false, note: "쇼핑·선택관광 있음, 가이드 경비 별도 — 쇼핑은 하루 1회 이내, 횟수·품목 확정 표기" },
  standard: { shoppingMax: 2, options: "reasonable", tipsIncluded: true, specialMealsMin: 1, signatureItems: false, note: "노쇼핑 또는 쇼핑 1~2회, 노팁, 선택관광은 합리적 가격" },
  premium: { shoppingMax: 0, options: "included", tipsIncluded: true, specialMealsMin: 2, signatureItems: false, note: "노쇼핑·노옵션(주요 옵션 포함)·노팁, 4~5성 도심 호텔 2연박 이상, 특식·미쉐린 2회 이상, 하루 3~4곳" },
  signature: { shoppingMax: 0, options: "included", tipsIncluded: true, specialMealsMin: 3, signatureItems: true, note: "프리미엄 + 이동일도 09:00 이후 출발, 2~3연박, 특색 숙소·특별 장소 식사·대표 체험 각 1회 이상, 하루 큰 덩어리 2~3곳" },
};

const DRIVING: Record<Region, PackageRules["driving"]> = {
  europe: { continuous: 270, rest: 45, daily: 540, basis: "EU 운전시간 규정 561/2006 — 4시간 30분 운전 후 45분 휴식, 하루 9시간" },
  japan: { continuous: 240, rest: 30, daily: 540, basis: "일본 버스 운전자 기준 — 연속 4시간 안에 30분 휴식, 하루 운전 9시간" },
  korea: { continuous: 240, rest: 30, daily: null, basis: "국내 전세버스 — 4시간 연속 운전 후 30분 휴게" },
  sea: { continuous: 240, rest: 30, daily: null, basis: "현지 규정은 업체 확인 (기본: 4시간 운전 후 30분 휴식)" },
  other: { continuous: 240, rest: 30, daily: null, basis: "현지 규정은 업체 확인 (기본: 4시간 운전 후 30분 휴식)" },
};

const REGION_NOTES: Record<Region, (destination: string) => string[]> = {
  sea: (d) => ["저녁 일정(야시장·야경·쇼)은 정상 — 21:30까지는 늦은 종료로 보지 않음", ...(/태국|방콕|파타야|푸켓|치앙마이|끄라비|코사무이/.test(d) ? ["태국은 태국 면허 가이드만 안내 가능 — 한국인 인솔자는 보조로"] : [])],
  japan: () => ["료칸 숙박일은 18:00 석식에 맞춰 도착", "버스는 하루 운전 9시간·연속 4시간 안에 30분 휴식"],
  europe: () => ["버스는 4시간 30분 운전 후 45분 휴식, 하루 운전 9시간", "루브르는 단체에 공인 가이드·사전 예약 필요, 로마 도심은 관광버스 진입 제한"],
  korea: () => ["전세버스는 4시간 연속 운전 후 30분 휴게"],
  other: () => [],
};

/** 고객 유형 — 여행 유형(시니어·신혼·장애인)과 동반자(아이·영유아·시니어) */
function customerOf(input: Pick<TripInput, "travelType" | "companions">): { senior: boolean; kids: boolean; infant: boolean; honeymoon: boolean; accessible: boolean } {
  const has = (c: Companion) => input.companions.includes(c);
  return { senior: input.travelType === "senior" || has("senior"), kids: has("kids"), infant: has("infant"), honeymoon: input.travelType === "honeymoon", accessible: input.travelType === "accessible" };
}

/** 이 상품의 규칙 — 운영 방식 기본값에 등급·고객·지역을 더한다 */
export function packageRules(input: Pick<TripInput, "operatingModel" | "productTier" | "travelType" | "companions" | "destination" | "tripScope">, cities: string[] = []): PackageRules {
  const model = input.operatingModel ?? "semi";
  const tier = input.productTier ?? "standard";
  const region = regionOf(input.destination, input.tripScope, cities);
  const b = BASE[model];
  const t = TIER[tier];
  const c = customerOf(input);
  let r: PackageRules = {
    ...b,
    tier,
    region,
    label: "",
    shoppingMax: model === "backpack" || model === "airtel" ? 0 : t.shoppingMax,
    options: model === "airtel" ? "none" : t.options,
    tipsIncluded: t.tipsIncluded,
    specialMealsMin: model === "backpack" || model === "airtel" ? 0 : t.specialMealsMin,
    signatureItems: t.signatureItems,
    driving: DRIVING[region],
    checkIn: "15:00",
    airportBefore: 180,
    dayEnd: region === "sea" ? "21:30" : region === "europe" ? "20:00" : "19:00",
    eveningOk: region === "sea",
    notes: [...b.notes, t.note],
  };
  const places = (max: number) => {
    r = { ...r, placesPerDay: [Math.min(r.placesPerDay[0], max), Math.min(r.placesPerDay[1], max)], firstDayMax: Math.min(r.firstDayMax, Math.max(1, max - 1)) };
  };
  if (model !== "airtel") {
    if (tier === "premium") {
      r = { ...r, meeting: maxClock(r.meeting, "09:00"), earliestMeeting: maxClock(r.earliestMeeting, "08:30"), minNightsPerHotel: Math.max(r.minNightsPerHotel, 2) };
      places(4);
    }
    if (tier === "signature") {
      r = { ...r, meeting: maxClock(r.meeting, "09:00"), earliestMeeting: maxClock(r.earliestMeeting, "09:00"), minNightsPerHotel: Math.max(r.minNightsPerHotel, 2), freeShare: [Math.max(r.freeShare[0], 0.15), Math.max(r.freeShare[1], 0.4)] };
      places(3);
    }
    if (c.senior) {
      r = { ...r, meeting: maxClock(r.meeting, "09:00"), earliestMeeting: maxClock(r.earliestMeeting, "09:00"), maxRideMinutes: Math.min(r.maxRideMinutes, 90), walkKmMax: 3, dayEnd: minClock(r.dayEnd, region === "sea" ? "20:30" : "19:00") };
      places(3);
      r.notes.push("시니어: 하루 핵심 1~3곳, 오전에 주요 관광·오후는 앉아서 하는 일정, 연속 이동 90분 이내, 걷기 하루 3km 이내, 계단·지하철 최소, 한식 1~2회, 2시간마다 화장실·휴식");
    }
    if (c.kids || c.infant) {
      r = { ...r, maxRideMinutes: Math.min(r.maxRideMinutes, c.infant ? 60 : 90) };
      places(3);
      r.notes.push(`아이 동반: 하루 2~3곳, 체험형 1곳 이상, 오후 수영장·휴식, 한 번 이동 ${c.infant ? 60 : 90}분 이내${c.infant ? ", 낮잠 13~15시 비우기" : ""}`);
    }
    if (c.honeymoon) {
      r = { ...r, meeting: maxClock(r.meeting, "10:00"), earliestMeeting: maxClock(r.earliestMeeting, "09:30"), minNightsPerHotel: Math.max(r.minNightsPerHotel, 2) };
      places(3);
      r.notes.push("허니문: 공항 단독 픽업, 가이드 투어 1일 안팎·나머지 자유, 리조트 연박, 객실 업그레이드·스파·디너 특전");
    }
    if (c.accessible) {
      r = { ...r, maxRideMinutes: Math.min(r.maxRideMinutes, 120), walkKmMax: 2 };
      places(3);
      r.notes.push("장애인: 휠체어 동선·화장실·엘리베이터 확인된 곳 위주, 하루 3곳 이내");
    }
  }
  r.notes.push(...REGION_NOTES[region](`${input.destination} ${cities.join(" ")}`));
  const who = [c.senior && "시니어", (c.kids || c.infant) && "아이 동반", c.honeymoon && "허니문", c.accessible && "장애인"].filter(Boolean).join("·");
  r.label = [OPERATING_MODELS.find((m) => m.id === model)?.label, model === "airtel" ? "" : PRODUCT_TIERS.find((x) => x.id === tier)?.label, who].filter(Boolean).join(" · ");
  return r;
}

/** AI 일정 지시문 — 규칙을 문장으로 */
export function packageRulesPrompt(r: PackageRules): string {
  const shop = r.shoppingMax === null ? "쇼핑센터는 하루 1회 이내, 첫날·출국 직전은 피함" : r.shoppingMax === 0 ? "쇼핑센터 방문 없음(노쇼핑) — 시장·야시장 같은 관광 명소는 괜찮음" : `쇼핑센터 최대 ${r.shoppingMax}회, 하루 1회 이내, 첫날·출국 직전은 피함`;
  const opt = { allowed: "선택관광은 기본일정이 끝난 뒤에 두고, 미참여 시 대체일정을 구체적으로", reasonable: "선택관광은 합리적 가격으로 기본일정 뒤에", included: "주요 선택관광은 기본일정에 포함(노옵션)", none: "선택관광 없음" }[r.options];
  return [
    "<package_rules>",
    `상품: ${r.label} (${REGION_LABEL[r.region]})`,
    r.dayStyle === "free" ? "- 하루 구성: 모든 날 free (항공·호텔만, freeNote에 참고용 추천 활동)" : `- 기본 하루 구성: ${r.dayStyle} (쉬는 날 규칙에 따라 일부 날은 late·pmfree·free)`,
    `- 오전 미팅 ${r.meeting} (${r.earliestMeeting}보다 이르게 잡지 않음)`,
    r.placesPerDay[1] > 0 ? `- 하루 방문 장소(관광·체험) ${range(r.placesPerDay)}, 첫날은 ${r.firstDayMax}곳 이내` : "",
    "- 석식은 18:00~20:00, 중식은 11:30~13:30에 시작 (디너 크루즈·선상 디너도 석식 시간대)",
    `- 한 번 차량 이동 ${r.maxRideMinutes}분 이내 (넘으면 중간에 휴게·관광 정차)`,
    r.walkKmMax ? `- 하루 걷기 ${r.walkKmMax}km 이내` : "",
    `- 하루 일정은 ${r.dayEnd}까지 끝냄${r.eveningOk ? " (저녁 야시장·야경·쇼는 정상)" : ""}`,
    `- 식사: ${r.meals}${r.specialMealsMin > 0 ? `, 특식(메뉴·식당 이름) ${r.specialMealsMin}회 이상` : ""}`,
    r.minNightsPerHotel > 1 ? `- 한 숙소 ${r.minNightsPerHotel}연박 이상 (호텔 바꾸는 횟수 최소)` : "",
    `- ${shop}`,
    `- ${opt}`,
    r.signatureItems ? "- 특색 숙소 1회, 현지 가정·특별 장소 식사 1회, 이 상품만의 대표 체험 1회를 반드시 넣음" : "",
    ...r.notes.map((n) => `- ${n}`),
    "</package_rules>",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ── 점검 ── */

const NOT_PLACE = new Set(["flight", "transfer", "hotel", "free_time", "meal"]);
const placeCount = (items: ItineraryItem[]) => items.filter((i) => !NOT_PLACE.has(i.type ?? "sightseeing")).length;
/** 관광 명소인 시장·몰은 쇼핑센터가 아니다 (업계: "쇼핑센터에 안 가면 노쇼핑") */
const MARKET = /시장|마켓|market|몰|mall|거리|스트리트|street|아울렛|outlet|백화점|플라자|야시장|아시아티크|터미널\s*21|로드|올드타운/i;
export const isShoppingCenter = (it: ItineraryItem) => it.type === "shopping" && !MARKET.test(it.name);
const SPECIAL = /특식|씨푸드|해산물|랍스터|스테이크|코스|뷔페|BBQ|바비큐|샤브|수끼|훠궈|미쉐린|파인\s*다이닝|선상\s*디너|디너\s*크루즈|가이세키|와규|킹크랩|대게|무제한|정식/i;
const isSpecialMeal = (it: ItineraryItem) => (it.type === "meal" || /디너|dinner/i.test(it.name)) && SPECIAL.test(`${it.name} ${it.cuisine ?? ""} ${it.description ?? ""}`);
const isFlightDay = (d: DayPlan) => d.items.some((i) => i.type === "flight");
/** 항공으로 시작하는 날 (도착일) — 미팅 시각이 항공에 달려 있다 */
const startsWithFlight = (d: DayPlan) => (d.kind === "semi" ? d.amGuided : d.items).find((i) => !/조식/.test(i.name))?.type === "flight";
const range = ([a, b]: [number, number]) => (a === b ? `${a}곳` : `${a}~${b}곳`);
const DINNER_NAME = /석식|저녁|디너|dinner/i;
const LUNCH_NAME_ = /중식|점심|런치|lunch/i;

/** 그날 규칙 점검 (일정 카드 "이 날 확인할 것") */
export function dayRuleIssues(days: DayPlan[], index: number, pmChoice: PmChoice, r: PackageRules): string[] {
  if (r.model === "airtel") return [];
  const day = days[index];
  const items = dayItems(day, pmChoice);
  const out: string[] = [];
  const n = placeCount(items);
  const max = index === 0 ? r.firstDayMax : r.placesPerDay[1];
  if (n > max && day.rest !== "free") out.push(`하루 ${n}곳 — ${r.label} 기준 ${index === 0 ? "첫날 " : ""}최대 ${max}곳`);
  // 새벽·밤 도착 다음 날 — 10:00 이후 미팅 또는 오전 자유 (업계 관행)
  if (index > 0 && dayWindow(days[index - 1], pmChoice, r.dayEnd).kind === "arrival-night" && !startsWithFlight(day) && morningFreeItems(day.kind === "semi" ? day.amGuided : day.items).length === 0) {
    const m = parseClock(dayMeetingTime(day)) ?? 0;
    if (m < 10 * 60) out.push(`새벽·밤 도착 다음 날인데 미팅 ${dayMeetingTime(day)} — 10:00 이후 미팅 또는 "호텔 조식 후 오전 자유"`);
  }
  // 한 번 차량 이동
  const rides = items.map((i) => (isRestStop(i) ? Math.max(i.travelMinutesToNext ?? 0, 0) : i.type === "transfer" ? Math.max(i.stayMinutes, 0) + Math.max(i.travelMinutesToNext ?? 0, 0) : i.type === "flight" ? 0 : Math.max(i.travelMinutesToNext ?? 0, 0)));
  const longest = Math.max(0, ...rides);
  if (longest > r.maxRideMinutes) out.push(`한 번 이동 ${longest}분 — 기준 ${r.maxRideMinutes}분 이내 (중간에 휴게·관광 정차)`);
  // 하루 운전 (유럽·일본)
  if (r.driving.daily) {
    const drive = rides.reduce((s, m) => s + m, 0);
    if (drive > r.driving.daily) out.push(`하루 차량 이동 ${Math.round(drive / 6) / 10}시간 — ${r.driving.basis}`);
  }
  // 걷기
  if (r.walkKmMax) {
    const km = dayIntensity(day, pmChoice).km;
    if (km > r.walkKmMax) out.push(`걷기 약 ${km}km — 기준 하루 ${r.walkKmMax}km 이내`);
  }
  // 식사 시간대 — 석식(디너 크루즈 포함)이 17:00 전, 중식이 11:00 전
  {
    const slots = walkTimeline(items, dayTourStart(day));
    for (const s of slots) {
      const name = s.item.name;
      if (s.item.type === "flight" || s.item.type === "transfer") continue;
      if (DINNER_NAME.test(name) && s.start < 17 * 60) out.push(`${name}이 ${formatClock(s.start)} 시작 — 석식은 18:00~20:00 (디너 크루즈는 보통 저녁 출항, 실제 시각 확인)`);
      else if (s.item.type === "meal" && LUNCH_NAME_.test(name) && s.start < 11 * 60) out.push(`${name}이 ${formatClock(s.start)} 시작 — 중식은 11:30~13:30`);
    }
  }
  // 쇼핑센터: 하루 1회, 첫날·출국 직전 피함
  const shops = items.filter(isShoppingCenter);
  if (shops.length > 1) out.push(`쇼핑센터 하루 ${shops.length}회 — 하루 1회 이내`);
  if (shops.length > 0 && (index === 0 || (index === days.length - 1 && isFlightDay(day)))) out.push(`${index === 0 ? "첫날" : "출국일"} 쇼핑센터(${shops[0].name}) — 첫날·출국 직전은 피합니다`);
  // 호텔 체크인 15:00 전 도착 (항공으로 도착한 날)
  if (isFlightDay(day)) {
    const slots = walkTimeline(items, dayTourStart(day));
    const hotel = slots.find((s) => s.item.type === "hotel" && /체크인/.test(s.item.name));
    const checkIn = parseClock(r.checkIn) ?? 900;
    if (hotel && hotel.start < checkIn && hotel.start >= 6 * 60) out.push(`호텔 체크인 ${formatClock(hotel.start)} — 보통 ${r.checkIn}부터라 얼리 체크인 확인 또는 관광 먼저`);
    // 출국: 공항 도착이 출발 3시간 전인가 (항공 시각을 아는 경우)
    // 귀국일(마지막 이틀 안, 그날 마지막이 시각을 아는 항공)
    const fi = slots.findIndex((s) => s.item.type === "flight" && s.item.fixedTime);
    if (fi > 0 && fi === slots.length - 1 && index >= days.length - 2) {
      const prev = slots[fi - 1];
      const arrive = prev.end + Math.max(0, prev.item.travelMinutesToNext ?? 0);
      const dep = parseClock(slots[fi].item.fixedTime!) ?? 0;
      if (dep - arrive < r.airportBefore && dep - arrive >= 0) out.push(`공항 도착이 출발 ${dep - arrive}분 전 — 국제선은 ${r.airportBefore / 60}시간 전 도착`);
    }
  }
  // 료칸: 18:00 석식 전 도착
  if (r.region === "japan") {
    const slots = walkTimeline(items, dayTourStart(day));
    const ryokan = slots.find((s) => s.item.type === "hotel" && /료칸|온천\s*호텔/.test(s.item.name));
    if (ryokan && ryokan.start > 18 * 60) out.push(`료칸 도착 ${formatClock(ryokan.start)} — 료칸 석식(18:00 무렵)에 맞춰 도착`);
  }
  return out;
}

/** 이 날 종료 기준 — 일정 카드의 "늦은 종료" 점검이 쓴다 */
export function dayEndStandard(r: PackageRules): string {
  return r.dayEnd;
}

export interface TripRuleIssue {
  key: string;
  text: string;
  /** 고치기: 미팅 시각 맞추기 (해당 날짜들) */
  meetingDays?: number[];
  /** 고치기: 선택관광으로 옮기기 (항목 id) */
  separateIds?: string[];
}

const SEPARATE = /별도\s*(진행|비용|요금|결제|구매)|가이드\s*(에게\s*)?문의|희망자|선택\s*관광|옵션\s*(진행|투어)/;

/** 원문상 "별도 진행"인 관광·체험 (해양 액티비티 "가이드 문의 후 별도 진행" 등) */
export function separateItems(days: DayPlan[], pmChoice: PmChoice): { day: number; item: ItineraryItem }[] {
  return days.flatMap((d) =>
    dayItems(d, pmChoice)
      .filter((i) => ["sightseeing", "experience", "massage"].includes(i.type ?? "sightseeing") && SEPARATE.test(`${i.name} ${i.description ?? ""} ${i.caution ?? ""}`))
      .map((item) => ({ day: d.day, item })),
  );
}

/** 별도 진행 항목을 일정에서 빼 선택관광으로 — 현지 별도 결제, 미참여 시 대체일정 표기 (정보제공 표준안) */
export function toOptionalTours(days: DayPlan[], ids: string[]): { days: DayPlan[]; options: TourOption[] } {
  const options: TourOption[] = [];
  const next = days.map((d) => {
    const hit = d.items.filter((i) => ids.includes(i.id));
    if (hit.length === 0) return d;
    for (const i of hit)
      options.push({
        id: `opt-${i.id}`,
        name: i.name,
        description: i.description ?? "",
        durationMinutes: Math.max(0, i.stayMinutes),
        dayNo: d.day,
        costPerPerson: i.entryFee,
        pricePerPerson: i.entryFee,
        minParticipants: 1,
        participationRate: 50,
        note: "현지 별도 진행 (불포함 사항)",
        alternative: "미참여 시 개인 자유시간 (가이드 미동행) — 집결 시각·장소는 가이드 안내",
      });
    // 빠진 항목의 다음 이동은 앞 항목이 이어받는다
    const items: ItineraryItem[] = [];
    for (const it of d.items) {
      if (ids.includes(it.id)) {
        const prev = items.at(-1);
        if (prev) items[items.length - 1] = { ...prev, travelMinutesToNext: Math.max(prev.travelMinutesToNext ?? 0, it.travelMinutesToNext ?? 0) };
        continue;
      }
      items.push(it);
    }
    return refitDay({ ...d, items });
  });
  return { days: next, options };
}

/** 상품 전체 규칙 점검 (상품 규칙 패널) */
export function tripRuleIssues(input: Pick<TripInput, "options" | "tipPerPerson" | "nights"> & Partial<Pick<TripInput, "selectedFlight">>, days: DayPlan[], pmChoice: PmChoice, r: PackageRules): TripRuleIssue[] {
  const out: TripRuleIssue[] = [];
  const all = days.flatMap((d) => dayItems(d, pmChoice));
  // 항공 시각 — 없으면 도착일·출국일 시각이 추정이다
  const flightDays = days.filter((d) => d.items.some((i) => i.type === "flight"));
  if (flightDays.length > 0 && !input.selectedFlight && !flightDays.some((d) => d.items.some((i) => i.type === "flight" && i.fixedTime)))
    out.push({ key: "flight-time", text: `항공 시각이 없어 DAY ${flightDays.map((d) => d.day).join("·")} 시각이 추정입니다 — 항공편을 넣어야 도착일·출국일(공항 3시간 전)이 맞습니다` });
  // 원문상 별도 진행 항목 — 일정이 아니라 선택관광으로
  const separate = separateItems(days, pmChoice);
  if (separate.length > 0)
    out.push({ key: "separate", text: `원문에 "별도 진행"인 항목 ${separate.length}개 (${separate.map((s) => s.item.name).join(", ")}) — 기본 일정이 아니라 선택관광으로 (요금·미참여 시 대체일정 표기)`, separateIds: separate.map((s) => s.item.id) });
  // 미팅 시각
  const early = days.filter((d) => !startsWithFlight(d) && d.rest !== "free" && morningFreeItems(d.kind === "semi" ? d.amGuided : d.items).length === 0 && (parseClock(dayMeetingTime(d)) ?? 0) < (parseClock(r.earliestMeeting) ?? 0));
  if (r.model !== "airtel" && early.length > 0)
    out.push({ key: "meeting", text: `미팅이 ${r.earliestMeeting}보다 이른 날: ${early.map((d) => `DAY ${d.day}(${dayMeetingTime(d)})`).join(", ")} — ${r.label} 기준 ${r.meeting} 미팅`, meetingDays: early.map((d) => d.day) });
  // 쇼핑
  const shops = all.filter(isShoppingCenter);
  if (r.shoppingMax !== null && shops.length > r.shoppingMax) out.push({ key: "shopping", text: `쇼핑센터 ${shops.length}회 (${shops.map((s) => s.name).join(", ")}) — ${r.shoppingMax === 0 ? "노쇼핑 등급" : `최대 ${r.shoppingMax}회`}` });
  // 선택관광
  const paidOptions = input.options.filter((o) => o.pricePerPerson > 0 && !/불포함|현지\s*별도/.test(o.note));
  if (r.options === "included" && paidOptions.length > 0) out.push({ key: "options-included", text: `별도 요금 선택관광 ${paidOptions.length}개 (${paidOptions.map((o) => o.name).join(", ")}) — 노옵션 등급은 주요 옵션을 기본일정에 포함` });
  if (r.options === "none" && input.options.length > 0) out.push({ key: "options-none", text: "에어텔·호텔팩은 선택관광을 일정에 넣지 않습니다 (참고용 추천으로)" });
  const noAlt = input.options.filter((o) => !o.alternative?.trim() || /차량\s*대기|버스\s*대기|주변\s*휴식/.test(o.alternative));
  if (r.options !== "none" && noAlt.length > 0) out.push({ key: "options-alt", text: `선택관광 ${noAlt.length}개에 미참여 시 대체일정이 없거나 "차량 대기·주변 휴식"뿐 — 정보제공 표준안: 대체일정·이동 방법을 구체적으로 (예: "미참여 시 개인 자유일정, 가이드 미동행")` });
  // 노팁
  if (r.tipsIncluded && r.model !== "airtel" && r.model !== "backpack" && input.tipPerPerson <= 0) out.push({ key: "tips", text: "가이드·기사 경비가 현지 지불로 되어 있음 — 이 등급은 경비 포함(노팁)" });
  // 특식
  const special = all.filter(isSpecialMeal);
  if (special.length < r.specialMealsMin) out.push({ key: "special-meals", text: `특식 ${special.length}회 — ${r.label} 기준 ${r.specialMealsMin}회 이상 (메뉴·식당 이름을 일정표에)` });
  // 연박
  if (r.minNightsPerHotel > 1 && input.nights >= 3) {
    const stays: { city: string; nights: number }[] = [];
    for (const d of days.slice(0, -1)) {
      const city = (d.overnightCity ?? "").trim();
      if (!city) continue;
      const last = stays.at(-1);
      if (last && last.city === city) last.nights += 1;
      else stays.push({ city, nights: 1 });
    }
    const short = stays.filter((s) => s.nights < r.minNightsPerHotel);
    if (short.length > 0) out.push({ key: "nights", text: `${short.map((s) => `${s.city} ${s.nights}박`).join(", ")} — ${r.label} 기준 한 숙소 ${r.minNightsPerHotel}연박 이상` });
  }
  // 자유시간 비중
  const tourDays = days.filter((d) => !d.items.every((i) => i.type === "flight" || i.type === "transfer" || i.type === "hotel"));
  if (tourDays.length >= 3 && r.model !== "airtel") {
    const free = tourDays.reduce((s, d) => s + (d.rest === "free" ? 1 : d.rest === "pmfree" || d.rest === "late" || d.kind === "semi" ? 0.5 : 0), 0);
    const share = free / tourDays.length;
    if (share < r.freeShare[0]) out.push({ key: "free-share", text: `자유시간 비중 ${Math.round(share * 100)}% — ${r.label} 기준 ${Math.round(r.freeShare[0] * 100)}% 이상 (반나절 자유·전일 자유를 넣으세요)` });
    else if (share > r.freeShare[1]) out.push({ key: "free-share", text: `자유시간 비중 ${Math.round(share * 100)}% — ${r.label} 기준 ${Math.round(r.freeShare[1] * 100)}% 이하` });
  }
  // 시그니처 필수 요소
  if (r.signatureItems) {
    const text = all.map((i) => `${i.name} ${i.description ?? ""}`).join(" ");
    const missing = [!/가정|홈\s*디너|미쉐린|파인\s*다이닝|셰프|특별\s*(식사|디너)/.test(text) && "현지 가정·특별 장소 식사", !/전용|프라이빗|단독|시그니처|특별\s*체험|클래스|공방|투어\s*독점/.test(text) && "이 상품만의 대표 체험"].filter(Boolean);
    if (missing.length > 0) out.push({ key: "signature", text: `시그니처 필수 요소 확인: ${missing.join(", ")} (특색 숙소 1회도 함께)` });
  }
  return out;
}

/** 미팅 시각 맞추기 — 고른 날의 미팅을 규칙 기본값으로 */
export function applyRuleMeeting(days: DayPlan[], dayNos: number[], r: PackageRules): DayPlan[] {
  return days.map((d) => (dayNos.includes(d.day) ? { ...d, meetingTime: r.meeting } : d));
}

/**
 * AI가 만든 일정에 규칙 미팅 시각을 넣는다 — 미팅을 정하지 않은 관광일만 (항공일·전일 자유·오전 자유·늦은 출발은 그대로).
 * 기본값(08:00)과 같으면 넣지 않는다.
 */
export function withRuleMeetings(days: DayPlan[], r: PackageRules): DayPlan[] {
  if (r.meeting === DEFAULT_MEETING_TIME || r.model === "airtel") return days;
  const next = days.map((d) => {
    if (d.meetingTime?.trim() || startsWithFlight(d) || d.rest === "free" || d.rest === "late" || morningFreeItems(d.kind === "semi" ? d.amGuided : d.items).length > 0) return d;
    return { ...d, meetingTime: r.meeting };
  });
  return next.some((d, i) => d !== days[i]) ? next : days;
}

/** 일정 카드의 늦은 종료 점검을 규칙 기준으로 */
export function ruleDayEnd(day: DayPlan, pmChoice: PmChoice, r: PackageRules) {
  return calcDayEnd(day, pmChoice, r.dayEnd, r.eveningOk);
}

/* ── 규칙대로 정리 ── */

const restStop = (id: string, travel: number): ItineraryItem => ({
  id: `${id}-rest`,
  type: "free_time",
  admission: "none",
  name: "휴게소 정차 (화장실·휴식)",
  description: "장거리 이동 중 쉬어 갑니다",
  stayMinutes: 20,
  travelMinutesToNext: travel,
  entryFee: 0,
  mealCost: 0,
  isEstimated: false,
});

/** 한 번 이동이 기준보다 길면 중간에 휴게소 정차 (차량 이동은 두 줄로 나눈다) */
function splitLongRides(items: ItineraryItem[], max: number): { items: ItineraryItem[]; n: number } {
  let n = 0;
  const out: ItineraryItem[] = [];
  for (const it of items) {
    if (it.type === "flight" || it.type === "free_time" || isRestStop(it) || items.some((x) => x.id === `${it.id}-rest`)) {
      out.push(it);
      continue;
    }
    if (it.type === "transfer" && it.stayMinutes > max && it.stayMinutes >= 60) {
      const half = Math.round(it.stayMinutes / 2 / 5) * 5;
      out.push({ ...it, stayMinutes: half, travelMinutesToNext: 0 }, restStop(it.id, 0), { ...it, id: `${it.id}-2`, name: `${it.name} (계속)`, stayMinutes: it.stayMinutes - half });
      n += 1;
      continue;
    }
    const t = it.travelMinutesToNext ?? 0;
    if (t > max && t >= 60) {
      const half = Math.round(t / 2 / 5) * 5;
      out.push({ ...it, travelMinutesToNext: half }, restStop(it.id, t - half));
      n += 1;
      continue;
    }
    out.push(it);
  }
  return { items: n > 0 ? out : items, n };
}

/** 쇼핑센터를 다른 날로 — 하루 1회, 첫날·출국일은 피한다. 받는 날은 쇼핑센터가 없는 가운데 관광일(숙소 줄 앞) */
function moveShopping(days: DayPlan[]): { days: DayPlan[]; moved: string[] } {
  const moved: string[] = [];
  let next = days;
  const last = days.length - 1;
  const bad = (k: number) => k === 0 || (k === last && isFlightDay(next[k]));
  for (let k = 0; k < days.length; k++) {
    if (next[k].kind !== "linear") continue;
    const shops = next[k].items.filter(isShoppingCenter);
    const extra = bad(k) ? shops : shops.slice(1);
    for (const shop of extra) {
      const to = next.findIndex((d, j) => j !== k && !bad(j) && d.kind === "linear" && d.rest !== "free" && !isFlightDay(d) && !d.items.some(isShoppingCenter));
      if (to < 0) break;
      next = next.map((d, j) => {
        if (j === k) return { ...d, items: d.items.filter((i) => i !== shop) };
        if (j !== to) return d;
        const items = [...d.items];
        const at = items.length > 0 && items[items.length - 1].type === "hotel" ? items.length - 1 : items.length;
        items.splice(at, 0, { ...shop, travelMinutesToNext: shop.travelMinutesToNext ?? 20 });
        return { ...d, items };
      });
      moved.push(`${shop.name} DAY ${days[k].day} → DAY ${next[to].day}`);
    }
  }
  return { days: next, moved };
}

export interface RuleFixResult {
  days: DayPlan[];
  /** 정리한 것 */
  changes: string[];
  /** 자동으로 못 고친 것 (사람이 판단) */
  left: string[];
}

/**
 * 규칙대로 정리 — 자동으로 고칠 수 있는 것만 고친다:
 *  ① 하루 구성(코스에 든 조식·이어진 자유시간·오전 자유 미팅) ② 이른 미팅 → 규칙 미팅 ③ 긴 이동 → 휴게소 정차
 *  ④ 쇼핑센터: 노쇼핑 등급은 빼고, 횟수 초과는 뒤에서부터 빼고, 첫날·출국일·하루 2회는 다른 날로 ⑤ 식사 시간대 다시 맞추기.
 * 장소 수·특식·연박·선택관광·경비는 상품 판단이라 남은 점검으로 돌려준다.
 */
export function applyPackageRules(days: DayPlan[], pmChoice: PmChoice, r: PackageRules, input: Pick<TripInput, "options" | "tipPerPerson" | "nights">): RuleFixResult {
  const changes: string[] = [];
  // ⓪ 불가능 시간 (새벽 도착일 관광·운영 시간 밖·체크인 뒤 등) — 맞는 자리·맞는 날로
  const impossible = fixImpossible(days, pmChoice, refitDay, r.dayEnd);
  changes.push(...impossible.changes);
  // ① 하루 구성
  let next = impossible.days.map((d) => {
    const f = fixDayStructure(d);
    if (f !== d) changes.push(`DAY ${d.day} 구성 정리 (조식·자유시간·오전 자유 미팅)`);
    return f;
  });
  // ①-2 "석식 (선상디너 크루즈)"처럼 식사인데 체험·관광으로 들어온 줄은 식사로 (식사 칸·특식·식사 시간대에 들어가게)
  next = next.map((d) => {
    let fixed = 0;
    const items = d.items.map((i) => {
      if (i.type !== "experience" && i.type !== "sightseeing") return i;
      if (!/^\s*(석식|중식|저녁|점심)|디너\s*크루즈|선상\s*디너|dinner\s*cruise/i.test(i.name)) return i;
      fixed += 1;
      return { ...i, type: "meal" as const, admission: "none" as const, mealCost: i.mealCost > 0 ? i.mealCost : i.entryFee, entryFee: 0 };
    });
    if (fixed === 0) return d;
    changes.push(`DAY ${d.day} 식사 ${fixed}줄을 식사로 바로잡음 (체험·관광으로 들어와 있던 것)`);
    return { ...d, items };
  });
  // ② 미팅
  const meeting = tripRuleIssues(input, next, pmChoice, r).find((i) => i.key === "meeting");
  if (meeting?.meetingDays) {
    next = applyRuleMeeting(next, meeting.meetingDays, r);
    changes.push(`DAY ${meeting.meetingDays.join("·")} 미팅 ${r.meeting}`);
  }
  // ②-2 새벽·밤 도착 다음 날은 10:00 이후 미팅
  next = next.map((d, k) => {
    if (k === 0 || dayWindow(next[k - 1], pmChoice, r.dayEnd).kind !== "arrival-night" || startsWithFlight(d)) return d;
    if (morningFreeItems(d.kind === "semi" ? d.amGuided : d.items).length > 0 || (parseClock(dayMeetingTime(d)) ?? 0) >= 10 * 60) return d;
    changes.push(`DAY ${d.day} 새벽 도착 다음 날 — 미팅 10:00`);
    return { ...d, meetingTime: "10:00" };
  });
  // ③ 긴 이동 → 휴게소
  if (r.model !== "airtel") {
    next = next.map((d) => {
      if (d.kind !== "linear") return d;
      const s = splitLongRides(d.items, r.maxRideMinutes);
      if (s.n === 0) return d;
      changes.push(`DAY ${d.day} 긴 이동 ${s.n}곳에 휴게소 정차 (${r.maxRideMinutes}분 기준)`);
      return { ...d, items: s.items };
    });
  }
  // ④ 쇼핑센터
  const allShops = next.flatMap((d) => d.items.filter(isShoppingCenter));
  if (r.shoppingMax !== null && allShops.length > r.shoppingMax) {
    const drop = new Set(r.shoppingMax === 0 ? allShops : allShops.slice(r.shoppingMax));
    next = next.map((d) => (d.items.some((i) => drop.has(i)) ? { ...d, items: d.items.filter((i) => !drop.has(i)) } : d));
    changes.push(`${r.shoppingMax === 0 ? "노쇼핑 등급 — " : `쇼핑 최대 ${r.shoppingMax}회 — `}쇼핑센터 ${drop.size}곳 뺌 (${[...drop].map((i) => i.name).join(", ")})`);
  }
  const shop = moveShopping(next);
  if (shop.moved.length) {
    next = shop.days;
    changes.push(`쇼핑센터 옮김: ${shop.moved.join(", ")} (하루 1회, 첫날·출국일 피함)`);
  }
  // ⑤ 식사 시간대
  next = next.map((d, i) => (d === days[i] ? d : refitDay(d)));
  const left = [
    ...tripRuleIssues(input, next, pmChoice, r).map((i) => i.text),
    ...next.flatMap((_, k) => dayRuleIssues(next, k, pmChoice, r).map((t) => `DAY ${next[k].day}: ${t}`)),
  ];
  return { days: changes.length ? next : days, changes, left };
}
