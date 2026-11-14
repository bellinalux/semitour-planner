/**
 * 대형 여행사 일정표 형식 글 — 네이버 패키지·대형사 상세 페이지와 같은 모양으로 채널 등록·고객 안내에 그대로 붙인다.
 *  N일차 2026.12.09.(수)
 *  * 아침 호텔식 · 점심 현지식 · 저녁 특식-토리텐나베
 *  * 힐튼 후쿠오카 시 호크
 *  * 전용차량
 *  * 대표 관광지: 라라포트 후쿠오카, 시사이드 모모치
 *  1. [후쿠오카] - 인천 국제공항 출발
 *  2. [야나가와] - [후쿠오카-야나가와 이동 : 약 1시간 30분 소요]
 *     ▶ 야나가와 뱃놀이 (약 30분 소요)
 * 소요 시간은 구간 이동과 체험처럼 시간이 정해진 것만 적는다 (대형사 관행 — 나머지 관광지는 현지 사정에 따라 달라진다).
 */
import { formatDuration } from "@/lib/format";
import { dayDate, dayMeals, documentItems, type DayMeals } from "@/lib/documents";
import { courseHotelName } from "@/lib/itineraryDoc";
import { isSpecialMeal } from "@/lib/packageRules";
import { mealSlotOf } from "@/lib/mealSlot";
import type { PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem, TripInput } from "@/types";

/** "2026.12.09(수)" → 대형사 표기 "2026.12.09.(수)" */
function dateLine(input: Pick<TripInput, "departureDate">, dayNo: number): string {
  const f = dayDate(input, dayNo);
  return f ? f.replace(/^(\d{4}\.\d{2}\.\d{2})(?=\()/, "$1.") : "";
}

function mealText(m: DayMeals["breakfast"], label: string, special: string | null): string {
  if (special) return `${label} ${special}`;
  if (m.mark === "불포함") return `${label} ${label === "아침" ? "없음" : "자유식"}`;
  if (m.mark === "호텔식") return `${label} 호텔식`;
  return `${label} ${m.cuisine || (m.mark === "현지 지불" ? "현지 지불" : "현지식")}`;
}

const SHOW_DURATION = new Set(["experience", "massage"]);
const isTour = (i: ItineraryItem) => ["sightseeing", "experience", "shopping", "massage"].includes(i.type ?? "sightseeing");

/** 한 줄 — 구간 이동은 "[A-B 이동 : 약 N 소요]", 체험·시각 고정은 소요 시간, 식사는 [먹거리], 숙소는 [숙박] */
function stepLine(i: ItineraryItem, city: string): string {
  const name = i.name.trim();
  if (i.type === "flight") return `[${city}] - ${name}`;
  if (i.type === "transfer") return `[${city}] - ${name}${i.stayMinutes > 0 ? ` [약 ${formatDuration(i.stayMinutes)} 소요]` : ""}`;
  if (i.type === "hotel") return /체크아웃|조식/.test(name) ? `[${city}] - ${name}` : `[숙박] - ${name}`;
  if (i.type === "meal") {
    const slot = mealSlotOf(i);
    if (isSpecialMeal(i)) return `[먹거리] - ${/^특식/.test(name) ? name : `특식-${name}`}`;
    return `[먹거리] - ${name}${i.cuisine && !name.includes(i.cuisine) ? ` (${i.cuisine})` : ""}${slot === "lunch" && !/중식|점심/.test(name) ? " · 중식" : slot === "dinner" && !/석식|저녁/.test(name) ? " · 석식" : ""}`;
  }
  if (i.type === "free_time") return `[${city}] - ${name}${i.stayMinutes > 0 ? ` (약 ${formatDuration(i.stayMinutes)})` : ""}`;
  const timed = SHOW_DURATION.has(i.type ?? "") || !!i.fixedTime || i.staySource === "competitor";
  return `▶ ${name}${i.fixedTime ? ` (${i.fixedTime})` : ""}${timed && i.stayMinutes > 0 ? ` (약 ${formatDuration(i.stayMinutes)} 소요)` : ""}`;
}

export function buildPackageFormatText(d: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice }): string {
  const { input, days, pmChoice } = d;
  const out: string[] = [];
  let prevCity = (input.originCity || "인천").trim();
  days.forEach((day, idx) => {
    const items = documentItems(day, pmChoice).flatMap((b) => b.items);
    const meals = dayMeals(days, idx, pmChoice, input);
    const special = (slot: "lunch" | "dinner") => {
      const m = items.find((i) => i.type === "meal" && mealSlotOf(i) === slot && isSpecialMeal(i));
      return m ? (/^특식/.test(m.name) ? m.name : `특식-${m.name}`) : null;
    };
    const city = (day.overnightCity ?? "").trim();
    const hotel = city ? (input.selectedHotels[city]?.name ?? courseHotelName(items) ?? `${city} 호텔`) : "숙소 없음";
    const tours = items.filter(isTour).map((i) => i.name.trim());
    out.push(`${day.day}일차${dateLine(input, day.day) ? ` ${dateLine(input, day.day)}` : ""}`);
    out.push(`* ${[mealText(meals.breakfast, "아침", null), mealText(meals.lunch, "점심", special("lunch")), mealText(meals.dinner, "저녁", special("dinner"))].join(" · ")}`);
    out.push(`* ${hotel}`);
    out.push(`* ${input.vehicleCostPerDay > 0 || input.operatingModel === "full" || input.operatingModel === "private" ? "전용차량" : "버스·대중교통"}`);
    if (tours.length > 0) out.push(`* 대표 관광지: ${tours.slice(0, 5).join(", ")}`);
    out.push("");
    let n = 0;
    let here = prevCity;
    items.forEach((i, k) => {
      if (i.type === "hotel" && /조식/.test(i.name)) return;
      const prev = items[k - 1];
      // 앞 장소에서 30분 넘게 차로 가면 "[A-B 이동 : 약 N 소요]"를 새 번호로
      const ride = prev && prev.type !== "flight" && (prev.travelMinutesToNext ?? 0) >= 30 ? prev.travelMinutesToNext! : 0;
      const landing = i.type === "flight" && /도착/.test(i.name);
      if (landing && city) here = city;
      if (ride && isTour(i)) {
        n += 1;
        out.push(`${n}. [${here}] - [${prev!.name.slice(0, 20)}-${i.name.slice(0, 20)} 이동 : 약 ${formatDuration(ride)} 소요]`);
        out.push(`   ${stepLine(i, here)}`);
        return;
      }
      const line = stepLine(i, here);
      if (line.startsWith("▶") && n > 0) out.push(`   ${line}`);
      else {
        n += 1;
        out.push(`${n}. ${line.startsWith("▶") ? `[${here}] - ${line.slice(2)}` : line}`);
      }
    });
    if (city) prevCity = city;
    out.push("");
  });
  return out.join("\n").trim();
}
