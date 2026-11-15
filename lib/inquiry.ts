import { serviceRequestSchema, type ServiceRequest } from "@/lib/serviceRequest";
import { SERVICE_IDS, STYLE_IDS, type ServiceId, type TravelStyle } from "@/lib/publicPlan";
import { z } from "zod";
import type { DayPlan } from "@/types";

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
  /** 고객이 "내 여행 코스 만들기"(/plan)로 만든 코스 — 직원이 [이 코스로 견적 시작]으로 연다 */
  plan: z
    .object({
      title: z.string().trim().max(80),
      planId: z.string().max(40).optional(),
      days: z.array(z.any()).min(1).max(15),
      cities: z.array(z.object({ name: z.string().max(40), nights: z.number().int().min(0).max(14) })).max(8).default([]),
      /** 고객이 고른 여행 방식 · 맡길 것 · 가이드 투어로 바꾼 날 */
      style: z.enum(STYLE_IDS).optional(),
      services: z.array(z.enum(SERVICE_IDS)).max(SERVICE_IDS.length).default([]),
      tourDays: z.array(z.number().int().min(1).max(30)).max(30).default([]),
    })
    .optional(),
  /** "우리에게 요청하기" — 항공권·호텔·유심 등 항목별 견적/예약 요청 */
  asks: serviceRequestSchema.optional(),
  /** 개인정보 수집·이용 동의 (코스 만들기 화면에서 받음) */
  consent: z.boolean().optional(),
});
export type InquiryInput = z.infer<typeof inquirySchema>;

export interface Inquiry extends Omit<InquiryInput, "website" | "plan"> {
  /** 고객이 만든 코스 (날짜별 일정) */
  planDays?: DayPlan[];
  planCities?: { name: string; nights: number }[];
  planStyle?: TravelStyle;
  planServices?: ServiceId[];
  planTourDays?: number[];
  /** 항공권·호텔·유심 등 항목별 요청 (견적/예약) */
  asks?: ServiceRequest;
  id: string;
  at: string;
  done: boolean;
  /** 고객 웹 일정표에서 [이 일정으로 예약 요청]으로 온 것 / 고객 코스 만들기에서 온 것 */
  source?: { kind: "share"; shareId: string; title: string; period: string; options: string[] } | { kind: "plan"; title: string; planId?: string };
}

/** 웹 일정표 예약 요청 (공개 — 링크를 받은 고객) */
export const bookRequestSchema = z.object({
  name: z.string().trim().min(1, "이름을 적어 주세요.").max(40),
  contact: z.string().trim().min(5, "연락처를 적어 주세요.").max(60),
  travelers: z.number().int().min(1).max(200),
  options: z.array(z.string().trim().max(120)).max(30).default([]),
  message: z.string().trim().max(500).default(""),
  website: z.string().max(0).default(""),
});

export const STYLE_LABEL: Record<InquiryInput["style"], string> = { package: "패키지", semi: "세미패키지", free: "자유여행", unsure: "상담 후 결정" };

/** 출발일이 날짜로 적혔으면 YYYY-MM-DD */
export function inquiryDate(text: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}
