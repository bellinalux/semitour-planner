/**
 * 일출·일몰 계산(NOAA 근사식, 오차 1~2분) — 바깥 서비스 없이 좌표와 날짜만으로.
 * 결과는 그 나라 현지 시각 "HH:MM" (나라별 시간대를 몰라도 경도로 어림 — 서머타임은 timeZone을 주면 반영)
 */
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;

function utcMinutes(lat: number, lng: number, date: Date, rising: boolean): number | null {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const N = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
  const lngHour = lng / 15;
  const t = N + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 282.634; L = ((L % 360) + 360) % 360;
  let RA = deg(Math.atan(0.91764 * Math.tan(rad(L)))); RA = ((RA % 360) + 360) % 360;
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(rad(L)), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
  if (cosH > 1 || cosH < -1) return null;   // 백야·극야
  const H = (rising ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH))) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = (((T - lngHour) % 24) + 24) % 24;
  return UT * 60;
}
function offsetMinutes(date: Date, lng: number, timeZone?: string): number {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(date);
      const off = parts.find(p => p.type === "timeZoneName")?.value ?? "";
      const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(off);
      if (m) return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
      if (/^GMT$/.test(off)) return 0;
    } catch { /* 모르는 시간대 */ }
  }
  return Math.round(lng / 15) * 60;
}
const hhmm = (m: number) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };

export function sunTimes(lat: number, lng: number, date: Date, timeZone?: string): { sunrise: string; sunset: string } | null {
  const r = utcMinutes(lat, lng, date, true), s = utcMinutes(lat, lng, date, false);
  if (r == null || s == null) return null;
  const off = offsetMinutes(date, lng, timeZone);
  return { sunrise: hhmm(r + off), sunset: hhmm(s + off) };
}

/** 나라 이름 → 대표 시간대 (일몰 현지 시각용) */
const TZ: Record<string, string> = {
  한국: "Asia/Seoul", 대한민국: "Asia/Seoul", 일본: "Asia/Tokyo", 중국: "Asia/Shanghai", 대만: "Asia/Taipei", 홍콩: "Asia/Hong_Kong",
  태국: "Asia/Bangkok", 베트남: "Asia/Ho_Chi_Minh", 싱가포르: "Asia/Singapore", 필리핀: "Asia/Manila", 인도네시아: "Asia/Jakarta", 말레이시아: "Asia/Kuala_Lumpur",
  이탈리아: "Europe/Rome", 프랑스: "Europe/Paris", 스페인: "Europe/Madrid", 독일: "Europe/Berlin", 영국: "Europe/London", 스위스: "Europe/Zurich",
  오스트리아: "Europe/Vienna", 체코: "Europe/Prague", 포르투갈: "Europe/Lisbon", 그리스: "Europe/Athens", 튀르키예: "Europe/Istanbul", 터키: "Europe/Istanbul",
  네덜란드: "Europe/Amsterdam", 크로아티아: "Europe/Zagreb", 헝가리: "Europe/Budapest", 미국: "America/New_York", 캐나다: "America/Toronto", 호주: "Australia/Sydney",
};
export function timeZoneForCountry(country?: string): string | undefined {
  if (!country) return undefined;
  const k = Object.keys(TZ).find(name => country.includes(name));
  return k ? TZ[k] : undefined;
}

/** 나라 이름 → ISO 두 글자 (공휴일 조회용) */
const ISO: Record<string, string> = {
  한국: "KR", 대한민국: "KR", 일본: "JP", 중국: "CN", 대만: "TW", 홍콩: "HK", 태국: "TH", 베트남: "VN", 싱가포르: "SG", 필리핀: "PH", 인도네시아: "ID", 말레이시아: "MY",
  이탈리아: "IT", 프랑스: "FR", 스페인: "ES", 독일: "DE", 영국: "GB", 스위스: "CH", 오스트리아: "AT", 체코: "CZ", 포르투갈: "PT", 그리스: "GR", 튀르키예: "TR", 터키: "TR",
  네덜란드: "NL", 크로아티아: "HR", 헝가리: "HU", 미국: "US", 캐나다: "CA", 호주: "AU",
};
export function isoForCountry(country?: string): string | undefined {
  if (!country) return undefined;
  const k = Object.keys(ISO).find(name => country.includes(name));
  return k ? ISO[k] : undefined;
}
