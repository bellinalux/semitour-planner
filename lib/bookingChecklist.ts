import { addDays, formatDate, parseDate } from "@/lib/documents";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, TripInput } from "@/types";

/**
 * 예약 확인 체크리스트 — 출발 전에 확정해야 할 것(숙소·항공·차량·가이드·식당·입장권·선택관광·보험·명단)을
 * 일정에서 뽑아, 업계에서 흔히 쓰는 확정 기한(출발 D-30 객실 명단 … D-3 최종 확인)과 함께 적는다.
 * 운영 지시서에 담당·확정번호 칸과 함께 인쇄한다.
 */

export interface ChecklistItem {
  group: "숙소" | "항공" | "차량·가이드" | "식당" | "입장·체험" | "선택관광" | "서류·기타";
  label: string;
  /** 출발 며칠 전까지 */
  dueDays: number;
  /** 출발일을 알면 기한 날짜 */
  due: string | null;
}

export function bookingChecklist(input: TripInput, days: DayPlan[], pmChoice: PmChoice, travelers: number): ChecklistItem[] {
  const start = parseDate(input.departureDate);
  const due = (d: number) => (start ? formatDate(addDays(start, -d)) : null);
  const out: ChecklistItem[] = [];
  const push = (group: ChecklistItem["group"], label: string, dueDays: number) => out.push({ group, label, dueDays, due: due(dueDays) });

  const lodging = input.packageType !== "land" && input.nights > 0;
  if (lodging) {
    const cities = [...new Set(days.map((d) => d.overnightCity?.trim()).filter((c): c is string => !!c))];
    for (const city of cities.length > 0 ? cities : [input.destination.trim() || "숙소"]) {
      const hotel = input.selectedHotels[city]?.name;
      push("숙소", `${city} ${hotel ?? "숙소"} 객실 확정 (${Math.ceil(travelers / Math.max(1, input.guestsPerUnit))}실)`, 30);
    }
    push("숙소", "객실 배정 명단(룸리스트) 전달", 14);
  }
  if (input.packageType === "full") {
    push("항공", `항공 좌석 ${travelers}석 확정·발권`, 21);
    push("항공", "여권 영문 이름·만료일 확인 (출발일 기준 6개월 이상)", 21);
  }
  if (input.pricingMode === "supplier") push("차량·가이드", "랜드사 행사 확정서(차량·가이드·호텔·식당) 받기", 14);
  else {
    if (input.vehicleCostPerDay > 0) push("차량·가이드", "전용 차량 배차 확정 (차종·기사 연락처)", 14);
    if (input.guideCostPerDay > 0) push("차량·가이드", "가이드 배정 확정 (이름·연락처)", 14);
  }
  if (input.pickupNote.trim() || input.sendingNote.trim()) push("차량·가이드", "공항 픽업·샌딩 시각·미팅 장소 전달", 7);

  for (const day of days) {
    for (const item of dayItems(day, pmChoice)) {
      const where = `DAY ${day.day}`;
      if (item.type === "meal" && item.payment !== "local" && !/조식|breakfast/i.test(item.name)) push("식당", `${where} ${item.name} ${travelers}명 예약`, 7);
      else if (item.type !== "meal" && item.entryFee > 0 && item.payment !== "local") {
        // 사전 예약이 필요하다고 적힌 곳은 더 일찍
        const reserve = /예약|reserv/i.test(item.caution ?? "");
        push("입장·체험", `${where} ${item.name} 입장권 ${travelers}매${reserve ? " (사전 예약 필요)" : ""}`, reserve ? 14 : 7);
      }
    }
  }
  for (const o of input.options) push("선택관광", `${o.dayNo > 0 ? `DAY ${o.dayNo} ` : ""}${o.name} 신청 인원 확인${o.minParticipants > 0 ? ` (최소 ${o.minParticipants}명)` : ""}`, 7);

  if (input.insurancePerPerson > 0) push("서류·기타", `여행자보험 ${travelers}명 가입`, 3);
  push("서류·기타", "최종 일정표·비상 연락처 고객 전달", 3);
  if (input.pricingMode === "supplier") push("서류·기타", "랜드사 잔금 송금", 7);
  return out.sort((a, b) => b.dueDays - a.dueDays);
}
