import { z } from "zod";

const includesSchema = z.object({
  guide: z.boolean(),
  meals: z.boolean(),
  admission: z.boolean(),
  vehicle: z.boolean(),
  // 이전에 저장된 경쟁사 정보에는 없을 수 있다
  hotel: z.boolean().default(false),
  flight: z.boolean().default(false),
});

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const uspRequestSchema = z.object({
  destination: z.string().trim().min(1).max(100),
  days: z.number().int().min(1).max(14),
  travelers: z.number().int().min(1).max(50),
  currency: z.enum(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]),
  pricePerPerson: z.number().min(0),
  ourIncludes: includesSchema,
  /** 일정 요약: 일차별 주제와 실제 진행되는 장소 이름 */
  itinerary: z
    .array(
      z.object({
        day: z.number().int(),
        theme: z.string().max(200),
        amPlaces: z.array(z.string().max(120)).max(30),
        pmTitle: z.string().max(200),
        pmPlaces: z.array(z.string().max(120)).max(30),
      }),
    )
    .max(14),
  competitors: z
    .array(
      z.object({
        name: z.string().max(100),
        price: z.number().min(0),
        includes: includesSchema,
        note: z.string().max(300),
      }),
    )
    .max(5),
  /** 붙여넣은 코스에서 읽은 상품 특징. AI 세미투어에서는 빈 값이다 */
  features: z
    .object({
      nights: z.number().int().min(0).max(30),
      cities: z.array(z.string().max(60)).max(10),
      hotelGrade: z.string().max(100),
      noShopping: z.boolean(),
      noOption: z.boolean(),
      highlights: z.array(z.string().max(100)).max(12),
    })
    .optional(),
});

export type UspRequest = z.infer<typeof uspRequestSchema>;

/** ---------- LLM 응답 ---------- */

export const uspResponseSchema = z.object({
  usps: z
    .array(
      z.object({
        title: z.string().describe("20자 안팎의 짧은 헤드라인"),
        reason: z.string().describe("제공된 사실에 근거한 1~2문장 설명"),
      }),
    )
    .length(3)
    .describe("경쟁사 대비 이 투어의 장점. 정확히 3개"),
});
