import { dayDate } from "@/lib/documents";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, TripInput } from "@/types";

/**
 * 업체 수배·확정 — 일정에서 수배할 것(호텔·차량·가이드·식당·선택관광)을 뽑아, 업체·요청일·상태·확정 번호를 기록한다.
 * 출발 14일 안인데 확정이 안 된 곳은 경고. 업체별 요청 문구를 한 번에 만든다. (여행사 도구의 수배·바우처 관리)
 */

export type BookingState = "todo" | "requested" | "confirmed" | "cancelled";
export const BOOKING_STATE_LABEL: Record<BookingState, string> = { todo: "미요청", requested: "요청함", confirmed: "확정", cancelled: "취소" };

export interface SupplierBooking {
  supplier: string;
  state: BookingState;
  requestedAt: string;
  confirmNo: string;
  note: string;
}

export interface ServiceLine {
  key: string;
  kind: "hotel" | "vehicle" | "guide" | "meal" | "option";
  label: string;
  /** 날짜·박수·인원 등 요청에 들어갈 내용 */
  detail: string;
}

const KIND_LABEL: Record<ServiceLine["kind"], string> = { hotel: "호텔", vehicle: "차량", guide: "가이드", meal: "식당", option: "선택관광" };
export const serviceKindLabel = (k: ServiceLine["kind"]) => KIND_LABEL[k];

const when = (input: Pick<TripInput, "departureDate">, day: number) => dayDate(input, day) ?? `DAY ${day}`;

/** 일정에서 수배할 것 목록 */
export function serviceLines(input: TripInput, days: DayPlan[], pmChoice: PmChoice): ServiceLine[] {
  const out: ServiceLine[] = [];
  const pax = Math.max(1, input.travelers);
  const rooms = Math.ceil(pax / Math.max(1, input.guestsPerUnit || 2));
  // 호텔: 같은 숙박 도시가 이어지는 구간마다 (체크인~체크아웃)
  let i = 0;
  while (i < days.length) {
    const city = (days[i].overnightCity ?? "").trim();
    if (!city) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < days.length && (days[j + 1].overnightCity ?? "").trim() === city) j += 1;
    const nights = j - i + 1;
    const hotel = input.selectedHotels[city]?.name ?? `${city} 호텔 (미정)`;
    out.push({ key: `hotel:${city}:${days[i].day}`, kind: "hotel", label: hotel, detail: `${when(input, days[i].day)} 체크인 · ${nights}박 · ${rooms}실 (${pax}명)` });
    i = j + 1;
  }
  const tourDays = days.filter((d) => dayItems(d, pmChoice).some((it) => !["flight", "hotel", "free_time"].includes(it.type ?? "sightseeing")));
  const span = tourDays.length ? `DAY ${tourDays[0].day}~${tourDays[tourDays.length - 1].day} (${tourDays.length}일)` : "";
  if (input.vehicleCostPerDay > 0) out.push({ key: "vehicle", kind: "vehicle", label: "전용 차량", detail: `${span} · ${pax}명` });
  if (input.guideCostPerDay > 0) out.push({ key: "guide", kind: "guide", label: input.tripScope === "domestic" ? "외국어 가이드" : "한국어 가이드", detail: `${span} · ${pax}명` });
  // 식당: 식대가 포함된(현지 지불 아닌) 점심·저녁
  for (const d of days)
    for (const it of dayItems(d, pmChoice))
      if (it.type === "meal" && it.payment !== "local" && it.mealCost > 0)
        out.push({ key: `meal:${it.id}`, kind: "meal", label: it.name, detail: `${when(input, d.day)} · ${pax}명${it.cuisine ? ` · ${it.cuisine}` : ""}` });
  for (const o of input.options) out.push({ key: `option:${o.id}`, kind: "option", label: o.name, detail: `${o.dayNo ? when(input, o.dayNo) : "날짜 미정"} · 최소 ${o.minParticipants}명` });
  return out;
}

export const emptyBooking = (): SupplierBooking => ({ supplier: "", state: "todo", requestedAt: "", confirmNo: "", note: "" });

/** 출발까지 남은 날 (출발일을 모르면 null) */
export function daysToDeparture(input: Pick<TripInput, "departureDate">, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.departureDate)) return null;
  const t = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(+input.departureDate.slice(0, 4), +input.departureDate.slice(5, 7) - 1, +input.departureDate.slice(8, 10)) - t) / 86_400_000);
}

export interface BookingSummary {
  total: number;
  confirmed: number;
  /** 출발 14일 안인데 확정 안 된 것 */
  urgent: ServiceLine[];
}

export function bookingSummary(lines: ServiceLine[], bookings: Record<string, SupplierBooking>, dLeft: number | null): BookingSummary {
  const active = lines.filter((l) => bookings[l.key]?.state !== "cancelled");
  const confirmed = active.filter((l) => bookings[l.key]?.state === "confirmed").length;
  const urgent = dLeft !== null && dLeft <= 14 ? active.filter((l) => bookings[l.key]?.state !== "confirmed") : [];
  return { total: active.length, confirmed, urgent };
}

/** 업체에 보낼 수배 요청 문구 (같은 업체에 맡긴 것을 한 번에) */
export function requestText(title: string, supplier: string, lines: ServiceLine[], company: string): string {
  return [
    `[수배 요청] ${company ? `${company} — ` : ""}${title}`,
    `${supplier || "담당자"}님, 아래 내용으로 예약(수배) 부탁드립니다.`,
    "",
    ...lines.map((l) => `· ${KIND_LABEL[l.kind]}: ${l.label} — ${l.detail}`),
    "",
    "확정되면 확정 번호(바우처)와 최종 요금을 회신 부탁드립니다.",
  ].join("\n");
}
