import { z } from "zod";

/**
 * 견적 요청 접수 — 고객이 웹 폼(/q)으로 남기는 여행 문의. 직원은 예약 관리에서 보고 "예약(문의)으로 만들기"·"입력에 채우기"로 이어 간다.
 * 로그인 없는 공개 폼이라 길이를 짧게 막고, 사람에게 안 보이는 칸(website)이 채워지면 자동 입력으로 보고 버린다.
 */
export const inquirySchema = z.object({
  name: z.string().trim().min(1, "이름을 적어 주세요.").max(40),
  contact: z.string().trim().min(5, "연락처를 적어 주세요.").max(60),
  destination: z.string().trim().min(1, "가고 싶은 곳을 적어 주세요.").max(60),
  departure: z.string().trim().max(20).default(""),
  nights: z.number().int().min(0).max(30).default(0),
  travelers: z.number().int().min(1).max(200),
  budget: z.number().int().min(0).max(100_000_000).default(0),
  style: z.enum(["package", "semi", "free", "unsure"]).default("unsure"),
  requests: z.string().trim().max(500).default(""),
  /** 자동 입력 막기 (화면에 안 보이는 칸) */
  website: z.string().max(0).default(""),
});
export type InquiryInput = z.infer<typeof inquirySchema>;

export interface Inquiry extends Omit<InquiryInput, "website"> {
  id: string;
  at: string;
  done: boolean;
}

export const STYLE_LABEL: Record<InquiryInput["style"], string> = { package: "패키지", semi: "세미패키지", free: "자유여행", unsure: "상담 후 결정" };

/** 출발일이 날짜로 적혔으면 YYYY-MM-DD */
export function inquiryDate(text: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}
