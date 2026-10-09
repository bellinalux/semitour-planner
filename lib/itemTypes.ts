import type { HotelGrade, HotelPreference, ItemType, TourCategory } from "@/types";

export const ITEM_TYPES: ItemType[] = [
  "flight",
  "transfer",
  "hotel",
  "sightseeing",
  "experience",
  "meal",
  "massage",
  "shopping",
  "free_time",
];

export const ITEM_TYPE_META: Record<ItemType, { label: string; emoji: string }> = {
  flight: { label: "항공", emoji: "✈️" },
  transfer: { label: "이동", emoji: "🚌" },
  hotel: { label: "숙소", emoji: "🏨" },
  sightseeing: { label: "관광", emoji: "📍" },
  experience: { label: "체험", emoji: "🎯" },
  meal: { label: "식사·카페", emoji: "🍽️" },
  massage: { label: "마사지", emoji: "💆" },
  shopping: { label: "쇼핑 명소", emoji: "🛍️" },
  free_time: { label: "자유시간", emoji: "☕" },
};

/** 입장/체험 요금을 받는 유형인지 (입력창 라벨 결정용) */
export function feeLabel(type: ItemType | undefined): string {
  return type === "experience" || type === "massage" ? "체험비" : "입장료";
}

/** stayMinutes를 "체류"로 부를지 "이동"으로 부를지. 항공·차량 이동 항목은 머무는 게 아니라 이동하는 시간이다. */
export function stayTimeLabel(type: ItemType | undefined): "이동" | "체류" {
  return type === "transfer" || type === "flight" ? "이동" : "체류";
}

export const HOTEL_GRADES: { id: HotelGrade; label: string }[] = [
  { id: "any", label: "전체" },
  { id: "3", label: "3성" },
  { id: "4", label: "4성" },
  { id: "5", label: "5성" },
  { id: "3-4", label: "3~4성 (섞어서)" },
  { id: "4-5", label: "4~5성 (섞어서)" },
  { id: "3-5", label: "3~5성 (섞어서)" },
  { id: "resort", label: "리조트" },
];
/** 서버 요청 검증(zod enum)에 쓰는 등급 값 목록 */
export const HOTEL_GRADE_IDS = ["any", "3", "4", "5", "3-4", "4-5", "3-5", "resort"] as const;

/** 등급의 성급 범위 [낮은, 높은] — 리조트는 5성으로, 전체는 null */
export function gradeRange(grade: HotelGrade): [number, number] | null {
  switch (grade) {
    case "3":
    case "4":
    case "5":
      return [Number(grade), Number(grade)];
    case "3-4":
      return [3, 4];
    case "4-5":
      return [4, 5];
    case "3-5":
      return [3, 5];
    case "resort":
      return [5, 5];
    default:
      return null;
  }
}

/** 원문 표기(예: "4·5성", "준특급~특급", "5성급 리조트")에서 성급 범위 — 모르면 null */
export function gradeRangeOfText(text: string): [number, number] | null {
  const nums = [...text.matchAll(/([345])\s*(?=[·,/~\-]|성|star|\*)/gi)].map((m) => Number(m[1]));
  if (/준특급/.test(text)) nums.push(4);
  if (/(^|[^준])특급|리조트|resort/i.test(text)) nums.push(5);
  return nums.length > 0 ? [Math.min(...nums), Math.max(...nums)] : null;
}
/** 범위의 가운데 값 (등급을 견줄 때) */
export const gradeMid = (r: [number, number]) => (r[0] + r[1]) / 2;

/** 화면·문서에 쓰는 등급 표기 (예: 4~5성급) */
export function gradeText(grade: HotelGrade): string {
  const r = gradeRange(grade);
  if (grade === "resort") return "리조트";
  if (!r) return "";
  return r[0] === r[1] ? `${r[0]}성급` : `${r[0]}~${r[1]}성급`;
}

export const HOTEL_PREFERENCES: { id: HotelPreference; label: string; query: string }[] = [
  { id: "transit", label: "역세권·교통 편리", query: "지하철·기차역에서 도보 가까운 곳, 대중교통 이용이 편한 곳" },
  { id: "airport", label: "공항 접근 좋음", query: "공항에서 이동이 편한 곳" },
  { id: "korean", label: "한국인 많이 이용", query: "한국인 여행객이 많이 이용하는 곳 (한국어 후기나 기사에서 확인되는 곳)" },
  { id: "breakfast", label: "조식 좋음", query: "조식이 좋다고 평가받는 곳" },
  { id: "value", label: "가성비", query: "가격 대비 만족도가 높은 곳" },
];

/** 프롬프트에 쓰는 등급 설명 */
export const HOTEL_GRADE_QUERY: Record<HotelGrade, string> = {
  any: "3성~5성급",
  "3": "3성급",
  "4": "4성급",
  "5": "5성급",
  "3-4": "3성급·4성급(섞어서 예약)",
  "4-5": "4성급·5성급(섞어서 예약)",
  "3-5": "3성급~5성급(섞어서 예약)",
  resort: "리조트형 호텔(휴양 시설을 갖춘 곳)",
};

export const TOUR_CATEGORIES: { id: TourCategory; label: string; emoji: string; query: string; itemType: ItemType }[] = [
  { id: "city", label: "시내 투어", emoji: "🏙️", query: "도시 핵심 명소를 도는 시내 투어(가이드 투어, 버스·도보 투어)", itemType: "experience" },
  { id: "night", label: "야경 투어", emoji: "🌃", query: "야경을 보는 투어(야경 버스, 야간 도보 투어)", itemType: "experience" },
  { id: "museum", label: "박물관·미술관", emoji: "🏛️", query: "박물관·미술관 가이드 투어나 입장권 포함 투어", itemType: "sightseeing" },
  { id: "daytrip", label: "근교 당일 투어", emoji: "🚌", query: "도시에서 당일로 다녀오는 근교 투어", itemType: "experience" },
  { id: "cruise", label: "크루즈", emoji: "🚢", query: "강이나 바다에서 즐기는 크루즈(디너 크루즈 포함)", itemType: "experience" },
  { id: "cooking", label: "쿠킹·체험", emoji: "👩‍🍳", query: "쿠킹 클래스, 공예 등 현지 체험 프로그램", itemType: "experience" },
  { id: "show", label: "공연·쇼", emoji: "🎭", query: "공연, 쇼, 콘서트", itemType: "experience" },
  { id: "activity", label: "액티비티", emoji: "🏄", query: "해양 액티비티(바나나보트, 스노클링 등)와 야외 액티비티", itemType: "experience" },
];

export const TOUR_CATEGORY_MAP = Object.fromEntries(TOUR_CATEGORIES.map((c) => [c.id, c])) as Record<
  TourCategory,
  (typeof TOUR_CATEGORIES)[number]
>;
