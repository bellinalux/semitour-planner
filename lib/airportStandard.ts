/**
 * 출국 공항 업계 기준 — 탑승 수속·보안 검색·출국 심사 시간을 두고 공항에 미리 도착한다.
 *  국제선: 출발 3시간 전 도착(성수기·연휴 3시간 30분), 탑승 수속(카운터) 마감 출발 60분 전, 탑승구 마감 30분 전
 *         (인천공항·항공사 안내, 단체는 여행사가 출발 3시간 전 공항 집결로 잡는다. 항공사·공항마다 50~75분 마감이 있어 발권 항공사로 확인)
 *  국내선: 출발 1시간 전 도착, 탑승 수속 마감 20분 전, 탑승구 마감 10분 전
 */
export type FlightScope = "international" | "domestic";

export const AIRPORT_STANDARD: Record<FlightScope, { arriveBefore: number; peakArriveBefore: number; counterClose: number; gateClose: number; label: string }> = {
  international: { arriveBefore: 180, peakArriveBefore: 210, counterClose: 60, gateClose: 30, label: "국제선" },
  domestic: { arriveBefore: 60, peakArriveBefore: 90, counterClose: 20, gateClose: 10, label: "국내선" },
};

const toMin = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const toClock = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const span = (min: number) => (min % 60 === 0 ? `${min / 60}시간` : min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`);

export interface AirportPlan {
  scope: FlightScope;
  /** 공항 도착 기준 시각 (출발 시각을 모르면 "") */
  arrive: string;
  counterClose: string;
  gateClose: string;
  /** 안내 한 줄 */
  text: string;
  /** 지금 일정으로 공항에 닿는 시각이 기준보다 늦으면 경고 */
  warning: string;
}

/** 출발 항공의 공항 일정 — 출발 시각(HH:MM)을 모르면 "출발 3시간 전" 같은 상대 표기 */
export function airportPlan(departure: string | undefined, scope: FlightScope, arriveAt?: string): AirportPlan {
  const s = AIRPORT_STANDARD[scope];
  const dep = departure ? toMin(departure) : null;
  if (dep === null) {
    return {
      scope,
      arrive: "",
      counterClose: "",
      gateClose: "",
      text: `${s.label} 출발 ${span(s.arriveBefore)} 전 공항 도착 (성수기 ${span(s.peakArriveBefore)} 전) · 탑승 수속 마감 ${s.counterClose}분 전 · 탑승구 마감 ${s.gateClose}분 전`,
      warning: "",
    };
  }
  const arrive = toClock(dep - s.arriveBefore);
  const counterClose = toClock(dep - s.counterClose);
  const gateClose = toClock(dep - s.gateClose);
  let warning = "";
  const at = arriveAt ? toMin(arriveAt) : null;
  if (at !== null) {
    // 자정 넘김(새벽 출발)을 고려한 남은 시간
    const left = (((dep - at) % 1440) + 1440) % 1440;
    if (left < s.arriveBefore && left < 12 * 60) {
      warning =
        left < s.counterClose
          ? `지금 일정으로는 공항에 ${arriveAt} 도착 — 출발 ${span(left)} 전이라 탑승 수속 마감(${s.counterClose}분 전)을 넘깁니다. 앞 일정을 줄이세요`
          : `지금 일정으로는 공항에 ${arriveAt} 도착 — 출발 ${span(left)} 전입니다. ${s.label}은 ${span(s.arriveBefore)} 전 도착이 기준이라 앞 일정을 당기세요`;
    }
  }
  return {
    scope,
    arrive,
    counterClose,
    gateClose,
    text: `공항 도착 ${arrive} (${s.label} 출발 ${span(s.arriveBefore)} 전, 성수기 ${span(s.peakArriveBefore)} 전) · 탑승 수속 마감 ${counterClose} · 탑승구 마감 ${gateClose}`,
    warning,
  };
}
