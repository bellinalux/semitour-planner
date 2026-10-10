import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan } from "@/types";
import type { ItineraryItem } from "@/types";

/** 장소 사진 — 직접 올린 사진이 먼저, 없으면 위키미디어 공용 사진(출처 표시) */
export function photoOf(it: Pick<ItineraryItem, "photo" | "photoUrl" | "photoCredit">): { src: string; credit: string } | null {
  if (it.photo) return { src: it.photo, credit: "" };
  if (it.photoUrl && /^https:\/\/upload\.wikimedia\.org\//.test(it.photoUrl)) return { src: it.photoUrl, credit: it.photoCredit ?? "" };
  return null;
}

/** 문서에 쓴 공용 사진의 출처 (라이선스상 표시해야 한다) */
export function photoCredits(days: DayPlan[], pmChoice: PmChoice): string[] {
  return [...new Set(days.flatMap((d) => dayItems(d, pmChoice)).filter((i) => !i.photo && photoOf(i)?.credit).map((i) => `${i.name}: ${photoOf(i)!.credit}`))].slice(0, 20);
}
