import { addDays, parseDate } from "@/lib/documents";

/**
 * AI가 정리한 항공편 시각·날짜를 한 가지 형식으로 맞춘다.
 * 모델은 "오후 7:20", "19시 20분", "06:00+1", "익일 06:00", "2026.11.10"처럼 제각각 적어 보내므로,
 * 화면·일정 반영·숙박 계산이 모두 같은 값을 보도록 서버에서 한 번 정리한다.
 */

const NEXT_DAY_BEFORE = /(익일|다음\s*날|\+\s*1\s*일?)\s*$/;
const NEXT_DAY_AFTER = /^\s*\(?\s*(\+\s*1|익일|다음\s*날)/;

/** "HH:mm", 다음날 도착이면 "HH:mm (+1)". 시각을 못 찾으면 빈 문자열 */
export function normalizeClock(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const m = /(\d{1,2})\s*:\s*(\d{2})/.exec(t) ?? /(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/.exec(t);
  if (!m) return "";
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const before = t.slice(0, m.index);
  const after = t.slice(m.index + m[0].length);
  const pm = /(오후|저녁|밤)\s*$/.test(before) || /^\s*(pm|p\.m\.)/i.test(after);
  const am = /(오전|새벽|아침)\s*$/.test(before) || /^\s*(am|a\.m\.)/i.test(after);
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23 || min > 59) return "";
  // 다음날 표시는 첫 시각 바로 앞뒤에 붙은 것만 본다 ("23:45 (또는 익일 00:25)"의 '익일'은 다른 시각 얘기)
  const next = NEXT_DAY_BEFORE.test(before) || NEXT_DAY_AFTER.test(after.replace(/^\s*(am|pm|a\.m\.|p\.m\.)/i, ""));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}${next ? " (+1)" : ""}`;
}

/** "2026.11.10", "2026/11/10", "2026년 11월 10일" → "2026-11-10". 없는 날짜면 빈 문자열 */
export function normalizeDate(text: string): string {
  const m = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(text);
  if (!m) return "";
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = parseDate(iso);
  // 2026-02-31처럼 넘치는 날짜는 Date가 다음 달로 넘기므로 되돌려 비교해 걸러낸다
  return d && d.getDate() === Number(m[3]) ? iso : "";
}

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 가는 편 날짜가 없으면 요청한 출발일, 귀국편 날짜가 없으면 출발일 + 숙박 수로 채운다 */
export function fillFlightDates(departDate: string, returnDepartDate: string, requested: { departureDate: string; nights: number }) {
  const depart = normalizeDate(departDate) || normalizeDate(requested.departureDate);
  let ret = normalizeDate(returnDepartDate);
  const start = parseDate(depart);
  if (!ret && start && requested.nights > 0) ret = toIso(addDays(start, requested.nights));
  return { departDate: depart, returnDepartDate: ret };
}
