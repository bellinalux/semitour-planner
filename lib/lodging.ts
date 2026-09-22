import type { TripInput } from "@/types";

/** 한 도시(또는 기본 요금 구간)의 숙박 */
export interface LodgingSegment {
  /** 도시 이름. 도시를 나누지 않는 기본 구간은 빈 문자열 */
  city: string;
  nights: number;
  /** 1실(유닛) 1박 요금 */
  rate: number;
}

/**
 * 숙박을 도시별 구간으로 나눈다.
 * 도시별 요금이 하나도 없거나 숙박 도시가 1곳뿐이면 "전체 박수 × 기본 요금" 한 구간이다.
 * 도시별 요금이 있으면 도시마다 그 도시의 박수 × (도시 요금, 없으면 기본 요금)이 되고,
 * 총 박수(input.nights)가 기준이라 일정에서 센 박수가 더 많으면 뒤쪽 도시부터 줄이고, 모자라면 기본 요금으로 채운다.
 */
export function lodgingSegments(
  input: Pick<TripInput, "nights" | "lodgingRatePerNight" | "lodgingCityRates">,
  stays: { city: string; nights: number }[],
): LodgingSegment[] {
  const base = input.lodgingRatePerNight;
  const cityRate = (city: string) => input.lodgingCityRates[city] ?? 0;
  const custom = stays.length >= 2 && stays.some((s) => cityRate(s.city) > 0);
  if (!custom) return [{ city: "", nights: input.nights, rate: base }];

  let remaining = Math.max(0, input.nights);
  const segments: LodgingSegment[] = [];
  for (const stay of stays) {
    const nights = Math.min(stay.nights, remaining);
    if (nights <= 0) continue;
    segments.push({ city: stay.city, nights, rate: cityRate(stay.city) > 0 ? cityRate(stay.city) : base });
    remaining -= nights;
  }
  if (remaining > 0) segments.push({ city: "", nights: remaining, rate: base });
  return segments;
}

/** 1실(유닛)이 전체 일정 동안 내는 숙박비 */
export function lodgingCostPerUnit(segments: LodgingSegment[]): number {
  return segments.reduce((sum, s) => sum + s.nights * s.rate, 0);
}
