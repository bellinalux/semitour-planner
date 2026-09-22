import { z } from "zod";

const CURRENCIES = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"] as const;

/** 코스별 선택 옵션 추천 요청 */
export const suggestOptionsRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  currency: z.enum(CURRENCIES),
  /** 1 견적통화 = ? KRW (견적 통화가 원화면 무시) */
  exchangeRateToKrw: z.number().min(0).max(1_000_000).default(0),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(300).optional(),
        /** 그 항목이 속한 도시 (여러 도시를 도는 코스에서 같은 이름의 장소를 구분하는 데 쓴다) */
        city: z.string().trim().max(60).optional(),
      }),
    )
    .min(1, "확인할 코스가 없습니다.")
    .max(30, "한 번에 30개까지 확인할 수 있습니다."),
});

export type SuggestOptionsRequest = z.infer<typeof suggestOptionsRequestSchema>;

/** 코스 하나에 대한 추천 결과 (클라이언트로 내려가는 형태) */
export interface SuggestedOptionResult {
  id: string;
  options: {
    name: string;
    description: string;
    status: "confirmed" | "unverified";
    localCurrency: string;
    localAmount: number;
    /** 견적 통화로 환산한 1인 금액. 환산하지 못하면 null */
    amountInQuote: number | null;
    sourceName: string;
    note: string;
  }[];
}

export interface SuggestOptionsResponse {
  results: SuggestedOptionResult[];
  sources: { title: string; url: string }[];
  searched: boolean;
  checkedAt: string;
  /** 환산에 쓴 환율 (1 단위 = ? 원) */
  fx: { currency: string; krwPerUnit: number; updatedAt: string }[];
}
