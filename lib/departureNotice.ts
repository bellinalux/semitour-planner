import { dayMeetingTime, hotelLeadMinutes } from "@/lib/dayLoad";
import { tripPeriod } from "@/lib/documents";
import type { PmChoice } from "@/lib/itinerary";
import { packingList, packingText } from "@/lib/packingList";
import type { SeasonResponse } from "@/lib/schemas/season";
import type { TravelInfo } from "@/lib/schemas/travelInfo";
import type { CompanyProfile, CourseMeta, DayPlan, TripInput } from "@/types";

/**
 * 출발 전 안내문 — 출발 2~3일 전 고객에게 보내는 문자·카톡용 글.
 * 미팅(공항·현지), 항공편, 첫날 일정, 날씨·전압·통화·입국, 준비물, 가이드 경비, 비상연락을 한 번에.
 */
export function departureNotice(
  d: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice; meta: CourseMeta | null; company: CompanyProfile },
  info?: TravelInfo | null,
  season?: SeasonResponse | null,
): string {
  const { input, days, pmChoice, meta, company } = d;
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const f = input.selectedFlight;
  const origin = input.originCity?.trim() || "인천";
  const lines: string[] = [];
  lines.push(`[${company.name || "여행사"}] ${input.customerName.trim() ? `${input.customerName.trim()}님, ` : ""}${title} 출발 안내드립니다.`);
  lines.push(`· 일정: ${tripPeriod(input)} (${input.nights}박 ${input.days}일)`);
  if (input.packageType === "full" || f) {
    lines.push(`· 공항 미팅: ${input.meetingNote.trim() || `항공 출발 3시간 전 ${origin}공항 (카운터 위치는 따로 안내)`}`);
    if (f?.flightNumber) lines.push(`· 가는 편: ${[f.airline, f.flightNumber].filter(Boolean).join(" ")} ${f.departTime} 출발 → ${f.arriveTime} 도착`);
    if (f?.returnFlightNumber) lines.push(`· 오는 편: ${[f.airline, f.returnFlightNumber].filter(Boolean).join(" ")} ${f.returnDepartTime} 출발 → ${f.returnArriveTime} 도착`);
  }
  if (input.pickupNote.trim()) lines.push(`· 현지 도착: ${input.pickupNote.trim()}`);
  const second = days[1];
  if (second && hotelLeadMinutes(second) > 0) lines.push(`· 둘째 날부터 매일 ${second.meetingTime?.trim() ? dayMeetingTime(second) : "가이드가 안내하는 시각"}에 호텔 로비에서 미팅합니다.`);
  const infoLines = [
    season?.weather || info?.weather ? `날씨: ${season?.weather || info?.weather}` : "",
    info?.timeDifference ? `시차: ${info.timeDifference}` : "",
    info?.voltage ? `전압: ${info.voltage}` : "",
    info?.currency ? `통화: ${info.currency}` : "",
    info?.visa ? `입국: ${info.visa}` : "",
  ].filter(Boolean);
  if (infoLines.length > 0) lines.push("", "[현지 정보]", ...infoLines.map((l) => `· ${l}`));
  const warn = (season?.notes ?? []).filter((n) => n.severity === "warn");
  if (warn.length > 0) lines.push("", "[출발 시기 참고]", ...warn.map((n) => `· ${n.title}${n.detail ? ` — ${n.detail}` : ""}`));
  lines.push("", "[준비물]", packingText(packingList(input, days, pmChoice, info, season)));
  lines.push("", input.tipPerPerson > 0 ? "· 가이드·기사 경비는 상품가에 포함되어 있습니다." : "· 가이드·기사 경비는 현지에서 가이드에게 직접 내시면 됩니다.");
  const emergency = [company.emergencyContact.trim() && `여행사 ${company.emergencyContact.trim()}`, info?.emergency && `현지 긴급 ${info.emergency}`].filter(Boolean);
  if (emergency.length > 0) lines.push(`· 비상연락: ${emergency.join(" / ")}`);
  lines.push("", "궁금하신 점은 언제든 연락 주세요. 즐거운 여행 되세요!");
  return lines.join("\n");
}
