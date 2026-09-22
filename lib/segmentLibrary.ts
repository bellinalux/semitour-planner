import type { ItineraryItem } from "@/types";

/** 라이브러리에 저장한 코스 조각. am/pm/day는 일정에서 통째로 저장한 것, place는 장소 하나만 저장한 것. */
export type SegmentKind = "am" | "pm" | "day" | "place";

export interface CourseSegment {
  id: string;
  name: string;
  /** 검색·필터에 쓰는 목적지 태그 */
  destination: string;
  kind: SegmentKind;
  items: ItineraryItem[];
  savedAt: string;
}

export const MAX_SEGMENTS = 80;
export const MAX_SEGMENT_NAME_LENGTH = 60;

export const SEGMENT_KIND_LABELS: Record<SegmentKind, string> = {
  am: "오전 코스",
  pm: "오후 코스",
  day: "하루 일정",
  place: "장소",
};

export function newSegmentId(): string {
  return `seg-${crypto.randomUUID().slice(0, 8)}`;
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isItem(v: unknown): v is ItineraryItem {
  return isObj(v) && typeof v.id === "string" && typeof v.name === "string";
}

const KINDS: SegmentKind[] = ["am", "pm", "day", "place"];

/** 저장소에서 읽은 값을 검증한다. 형식이 맞지 않으면 null. */
export function parseSegment(v: unknown): CourseSegment | null {
  if (!isObj(v) || typeof v.id !== "string" || typeof v.name !== "string" || typeof v.savedAt !== "string") return null;
  if (typeof v.destination !== "string" || !KINDS.includes(v.kind as SegmentKind)) return null;
  if (!Array.isArray(v.items) || v.items.length === 0 || !v.items.every(isItem)) return null;
  return {
    id: v.id,
    name: v.name.slice(0, MAX_SEGMENT_NAME_LENGTH),
    destination: v.destination,
    kind: v.kind as SegmentKind,
    items: v.items,
    savedAt: v.savedAt,
  };
}
