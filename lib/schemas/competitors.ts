import { z } from "zod";
import type { CompetitorCandidate } from "@/types";

const CURRENCIES = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"] as const;

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const competitorRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  nights: z.number().int().min(0).max(30),
  days: z.number().int().min(1).max(31),
  currency: z.enum(CURRENCIES),
  packageType: z.enum(["land", "land_hotel", "full"]),
  /** 출발지 (풀패키지 비교에 쓴다) */
  originCity: z.string().trim().max(60).default(""),
});

export type CompetitorRequest = z.infer<typeof competitorRequestSchema>;

/** ---------- LLM 응답 ---------- */

export const competitorResponseSchema = z.object({
  products: z
    .array(
      z.object({
        agency: z.string().describe("여행사 이름 (예: 하나투어, 모두투어, 노랑풍선, 참좋은여행, 인터파크투어). 확인 못하면 빈 문자열"),
        productName: z.string().describe("상품명. 메모에 적힌 그대로"),
        pricePerPerson: z.number().describe("성인 1인 요금 (요청 통화 단위 숫자). 확인 못하면 0"),
        priceNote: z.string().describe("요금 조건 한 줄 (예: 유류할증료 별도, 2인 1실 기준, 출발일에 따라 변동). 없으면 빈 문자열"),
        nights: z.number().describe("숙박 수. 모르면 0"),
        days: z.number().describe("총 일수. 모르면 0"),
        hotelGrade: z.string().describe("호텔 등급 표기 (예: 4성급, 5성급). 확인 못하면 빈 문자열"),
        includesGuide: z.boolean().describe("가이드 동행이 포함이면 true"),
        includesMeals: z.boolean().describe("식사가 포함이면 true"),
        includesAdmission: z.boolean().describe("입장료가 포함이면 true"),
        includesVehicle: z.boolean().describe("전용 차량·차량 이동이 포함이면 true"),
        includesHotel: z.boolean().describe("숙박이 포함이면 true"),
        includesFlight: z.boolean().describe("왕복 항공이 포함이면 true"),
        noShopping: z.boolean().describe("노쇼핑을 내세우면 true"),
        noOption: z.boolean().describe("노옵션을 내세우면 true"),
        policyUnknown: z.boolean().describe("메모에서 쇼핑·선택관광 언급을 전혀 찾지 못했으면 true. 노쇼핑/노옵션이라고 밝힌 경우에는 false"),
        highlight: z.string().describe("이 상품의 특징 한 줄. 없으면 빈 문자열"),
        basis: z.enum(["searched", "estimated"]).describe("판매 페이지에서 요금을 확인했으면 searched, 아니면 estimated"),
        sourceName: z.string().describe("요금을 확인한 사이트 이름. 없으면 빈 문자열"),
        productUrl: z
          .string()
          .describe(
            "이 상품의 실제 판매 페이지(상세 페이지) URL. 조사 메모에 정확한 URL이 적혀 있을 때만 그대로 옮기고, 메모에 없거나 확실하지 않으면 빈 문자열로 둡니다. 홈페이지나 검색결과 URL을 지어내지 않습니다.",
          ),
      }),
    )
    .describe("찾은 경쟁 상품 목록 (3~6개)"),
});

type Parsed = z.infer<typeof competitorResponseSchema>;

const clean = (s: string) => s.trim();

/** 여행사 상품을 구글에서 다시 찾아볼 수 있는 검색 링크 (실제 상품 URL을 모를 때의 대체 수단) */
function fallbackSearchUrl(agency: string, productName: string): string {
  const q = [agency, productName].filter(Boolean).join(" ").slice(0, 120);
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** 조사 메모에서 옮겨 온 값이 실제로 쓸 수 있는 http(s) URL인지 (모델이 잘못 채운 값을 거른다) */
function isUsableUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** 검증된 응답을 앱 내부 형태로 다듬는다. 이름이 없거나 요금이 음수인 항목은 버린다. */
export function toCompetitorCandidates(parsed: Parsed): CompetitorCandidate[] {
  return parsed.products
    .filter((p) => clean(p.productName) !== "" || clean(p.agency) !== "")
    .map((p) => ({
      agency: clean(p.agency),
      productName: clean(p.productName),
      pricePerPerson: Math.max(0, Math.round(p.pricePerPerson)),
      priceNote: clean(p.priceNote),
      nights: Math.max(0, Math.round(p.nights)),
      days: Math.max(0, Math.round(p.days)),
      hotelGrade: clean(p.hotelGrade),
      includes: {
        guide: p.includesGuide,
        meals: p.includesMeals,
        admission: p.includesAdmission,
        vehicle: p.includesVehicle,
        hotel: p.includesHotel,
        flight: p.includesFlight,
      },
      noShopping: p.noShopping,
      noOption: p.noOption,
      policyUnknown: p.policyUnknown && !p.noShopping && !p.noOption,
      highlight: clean(p.highlight),
      basis: p.pricePerPerson > 0 ? p.basis : "estimated",
      sourceName: clean(p.sourceName),
      searchUrl: isUsableUrl(clean(p.productUrl)) ? clean(p.productUrl) : fallbackSearchUrl(clean(p.agency), clean(p.productName)),
      linkIsDirect: isUsableUrl(clean(p.productUrl)),
    }));
}
