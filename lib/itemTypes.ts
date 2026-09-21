import type { HotelGrade, HotelPreference, ItemType } from "@/types";

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

export const HOTEL_GRADES: { id: HotelGrade; label: string }[] = [
  { id: "any", label: "전체" },
  { id: "3", label: "3성" },
  { id: "4", label: "4성" },
  { id: "5", label: "5성" },
  { id: "resort", label: "리조트" },
];

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
  resort: "리조트형 호텔(휴양 시설을 갖춘 곳)",
};
