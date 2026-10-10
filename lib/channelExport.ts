import { includeLists, tripPeriod } from "@/lib/documents";
import { docTitle } from "@/lib/englishDoc";
import { localPayRows } from "@/lib/fees";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { CourseMeta, DayPlan, QuoteData, TripInput, UspItem } from "@/types";

/**
 * 판매 채널 등록용 상품 정보 — 마이리얼트립·스마트스토어·자사몰 등록 화면에 그대로 붙여 넣는 항목별 글과,
 * 여러 칸으로 나눈 CSV(엑셀). 원가·마진·업체 이름은 넣지 않는다.
 */

interface Data {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteData;
  meta: CourseMeta | null;
  usps: UspItem[];
}

const SKIP = new Set(["transfer", "hotel", "flight"]);

export interface Listing {
  title: string;
  /** 한 줄 소개 (세일즈 포인트 첫 줄) */
  tagline: string;
  highlights: string[];
  period: string;
  duration: string;
  price: number;
  currency: string;
  minTravelers: number;
  included: string[];
  excluded: string[];
  schedule: string[];
  notices: string[];
  /** 검색 태그 */
  tags: string[];
}

export function buildListing(d: Data): Listing {
  const { input, days, pmChoice, quote, meta, usps } = d;
  const local = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, local.rows.length > 0);
  const title = docTitle({ input, meta });
  const places = [...new Set(days.flatMap((day) => dayItems(day, pmChoice).filter((i) => !SKIP.has(i.type ?? "sightseeing") && i.type !== "meal").map((i) => i.name.trim())))];
  const tags = [...new Set([input.destination.split(/[,\s]+/)[0], ...(meta?.cities ?? []), meta?.noShopping ? "노쇼핑" : "", meta?.noOption ? "노옵션" : "", `${input.nights}박${input.days}일`, ...places.slice(0, 5)].filter(Boolean))].slice(0, 10);
  return {
    title,
    tagline: usps[0] ? `${usps[0].title} — ${usps[0].reason}` : (meta?.highlights?.[0] ?? ""),
    highlights: [...usps.slice(0, 5).map((u) => u.title), ...(meta?.highlights ?? [])].slice(0, 6),
    period: tripPeriod(input),
    duration: `${input.nights}박 ${input.days}일`,
    price: Math.round(quote.partnerConsumerPrice ?? quote.scenario.pricePerPerson),
    currency: input.currency,
    minTravelers: input.minTravelers,
    included,
    excluded,
    schedule: days.map((day) => {
      const names = dayItems(day, pmChoice)
        .filter((i) => !SKIP.has(i.type ?? "sightseeing"))
        .map((i) => (i.type === "meal" ? `${i.name}(식사)` : i.name));
      return `DAY ${day.day}${day.theme ? ` ${day.theme}` : ""}: ${names.join(" → ") || "자유 일정"}`;
    }),
    notices: [
      ...(local.rows.length > 0 ? [`현지 지불: ${local.rows.map((r) => r.name).join(", ")}`] : []),
      ...(input.minTravelers > 0 ? [`최소 출발 인원 ${input.minTravelers}명 — 미달 시 출발 7일 전까지 안내`] : []),
      "1인 요금은 2인 1실 기준이며 1인실 사용 시 추가 요금이 있습니다.",
      "현지 사정에 따라 일정 순서가 바뀔 수 있습니다.",
    ],
    tags,
  };
}

/** 등록 화면에 붙여 넣는 항목별 글 */
export function listingText(l: Listing): string {
  const sec = (name: string, lines: string[]) => (lines.length > 0 ? [`【${name}】`, ...lines, ""] : []);
  return [
    `【상품명】 ${l.title}`,
    ...(l.tagline ? [`【한 줄 소개】 ${l.tagline}`] : []),
    `【여행 기간】 ${l.duration}${l.period !== "미정" ? ` (${l.period})` : ""}`,
    `【판매가】 1인 ${l.price.toLocaleString("ko-KR")} ${l.currency}`,
    "",
    ...sec("상품 특징", l.highlights.map((h) => `· ${h}`)),
    ...sec("일정", l.schedule),
    ...sec("포함 사항", l.included.map((x) => `· ${x}`)),
    ...sec("불포함 사항", l.excluded.map((x) => `· ${x}`)),
    ...sec("유의 사항", l.notices.map((x) => `· ${x}`)),
    `【검색 태그】 ${l.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")}`,
  ].join("\n");
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 한 상품 한 줄 CSV (머리줄 포함) — 채널 대량 등록 양식에 칸을 맞춰 옮긴다 */
export function listingCsv(l: Listing): string {
  const head = ["상품명", "한줄소개", "기간", "출발일", "판매가", "통화", "최소인원", "특징", "일정", "포함", "불포함", "유의사항", "태그"];
  const row = [l.title, l.tagline, l.duration, l.period, l.price, l.currency, l.minTravelers || "", l.highlights.join(" / "), l.schedule.join(" / "), l.included.join(", "), l.excluded.join(", "), l.notices.join(" / "), l.tags.join(",")];
  return `﻿${head.map(csvCell).join(",")}\n${row.map(csvCell).join(",")}\n`;
}
