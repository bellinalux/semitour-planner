import type { ItemType } from "@/types";

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
