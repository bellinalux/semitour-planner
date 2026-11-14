import { z } from "zod";

/** 다른 여행사 상품 링크 가져오기 요청 */
export const productImportRequestSchema = z.object({
  url: z
    .string()
    .trim()
    .url("링크 형식이 올바르지 않습니다.")
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), "http(s) 링크만 넣을 수 있습니다."),
  currency: z.enum(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]).default("KRW"),
});
export type ProductImportRequest = z.infer<typeof productImportRequestSchema>;

const leg = z.object({
  airline: z.string().describe("항공사. 모르면 빈 문자열"),
  flightNumber: z.string().describe("편명 (예: KE723). 모르면 빈 문자열"),
  date: z.string().describe("출발 날짜 YYYY-MM-DD. 모르면 빈 문자열"),
  departAirport: z.string().describe("출발 공항 (예: 인천(ICN))"),
  departTime: z.string().describe("출발 시각 HH:mm (현지). 모르면 빈 문자열"),
  arriveAirport: z.string().describe("도착 공항"),
  arriveTime: z.string().describe("도착 시각 HH:mm (현지). 다음날 도착이면 '+1'을 붙임. 모르면 빈 문자열"),
});

/** 페이지에서 읽은 상품 정보 */
export const productImportResultSchema = z.object({
  found: z.boolean().describe("상품 상세(일정·가격)를 실제로 읽었으면 true"),
  productName: z.string().describe("상품명"),
  agency: z.string().describe("판매·운영 여행사 (예: 노랑풍선)"),
  destination: z.string().describe("여행지 도시들, 쉼표로 (예: 오사카, 교토)"),
  departureDate: z.string().describe("출발일 YYYY-MM-DD. 모르면 빈 문자열"),
  nights: z.number().describe("숙박 수. 모르면 0"),
  days: z.number().describe("총 일수. 모르면 0"),
  pricePerPerson: z.number().describe("성인 1인 판매가 (요청 통화, 유류할증료 포함 총액이 있으면 그 값). 모르면 0"),
  priceNote: z.string().describe("가격 조건 한 줄 (예: 유류할증료 포함, 2인 1실 기준, 싱글차지 별도). 없으면 빈 문자열"),
  outbound: leg.describe("가는 편"),
  inbound: leg.describe("오는 편"),
  hotel: z.string().describe("호텔 이름·등급 (여러 개면 쉼표). 모르면 빈 문자열"),
  mustSee: z.array(z.string()).describe("일정의 주요 방문지·체험 이름 (중복 없이, 최대 15개)"),
  included: z.array(z.string()).describe("포함 사항"),
  excluded: z.array(z.string()).describe("불포함 사항"),
  shopping: z.number().describe("쇼핑센터 방문 횟수. 없으면 0, 모르면 -1"),
  optionTours: z.array(z.string()).describe("선택관광 이름(가격) 목록"),
  guideFee: z.string().describe("가이드·기사 경비 조건 (예: 1인 $50 현지 지불). 없으면 빈 문자열"),
  cancelPolicy: z.string().describe("취소 규정 요약 한두 줄. 없으면 빈 문자열"),
  courseDetail: z
    .boolean()
    .describe("날짜별 세부 일정(1. 2. 3.처럼 순서대로 적힌 이동·관광·식사 줄)을 읽어 courseText를 만들었으면 true. 날짜 요약(식사·호텔·교통·관광지 목록)만 읽었으면 false"),
  courseText: z
    .string()
    .describe("날짜별 세부 일정 원문을 옮긴 글 — '제N일 (날짜)' 머리 뒤에 세부 일정(1. 2. 3.) 순서 그대로: 항공편·시각, 이동, 방문지, 식사, 호텔. 날짜 요약 목록(식사·호텔·관광지 나열)의 순서를 쓰지 않음. 확인하지 못하면 빈 문자열"),
});
export type ProductImportResult = z.infer<typeof productImportResultSchema>;

export interface ProductImportResponse extends ProductImportResult {
  url: string;
  /** 서버가 페이지를 직접 읽었는지 (못 읽으면 AI가 링크·검색으로 읽음) */
  readDirect: boolean;
  /** 출발일을 링크 주소에서 읽었는지 */
  dateFromLink?: boolean;
  /** AI가 읽은 출발일이 링크 주소의 출발일과 달랐는지 (다른 날짜 상품이 섞였을 수 있음) */
  dateMismatch?: boolean;
  sources: { title: string; url: string }[];
}
