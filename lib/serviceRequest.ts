/**
 * "우리에게 요청하기" — 고객이 항공권·호텔·유심 등을 눌러 항목별로 적고 견적/예약을 요청한다.
 * 코스를 만들지 않아도 쓸 수 있고, 만든 코스가 있으면 함께 보낸다.
 */
import { z } from "zod";
import { SERVICE_IDS, SERVICE_LABEL, type ServiceId } from "@/lib/publicPlan";
import type { HotelGrade, TripInput } from "@/types";

const GRADE: Record<string, HotelGrade> = { "가성비(3성)": "3", "4성": "4", "5성·고급": "5", "료칸·리조트": "resort" };

export interface AskField {
  key: string;
  label: string;
  type: "text" | "date" | "select" | "number";
  options?: string[];
  placeholder?: string;
}

export const ASK_ICON: Record<ServiceId, string> = { flight: "✈", hotel: "🏨", transfer: "🚐", tour: "🎫", guide: "🚌", meals: "🍱", pass: "🚇", esim: "📶", insurance: "🛡" };

/** 항목별로 받는 칸 (짧게 — 나머지는 직원이 연락해서 묻는다) */
export const ASK_FIELDS: Record<ServiceId, AskField[]> = {
  flight: [
    { key: "from", label: "출발 공항", type: "select", options: ["인천", "김포", "김해(부산)", "대구", "청주", "제주", "무안", "기타"] },
    { key: "go", label: "가는 날", type: "date" },
    { key: "back", label: "오는 날", type: "date" },
    { key: "seat", label: "좌석", type: "select", options: ["일반석", "프리미엄 일반석", "비즈니스"] },
    { key: "time", label: "선호 시간", type: "select", options: ["상관없음", "오전 출발", "오후 출발", "저녁 출발"] },
  ],
  hotel: [
    { key: "area", label: "지역·구역", type: "text", placeholder: "예) 하카타역 주변" },
    { key: "checkin", label: "체크인", type: "date" },
    { key: "nights", label: "박수", type: "number" },
    { key: "rooms", label: "객실", type: "text", placeholder: "예) 트윈 1, 더블 1" },
    { key: "grade", label: "등급", type: "select", options: ["가성비(3성)", "4성", "5성·고급", "료칸·리조트"] },
  ],
  transfer: [
    { key: "way", label: "구간", type: "select", options: ["픽업+샌딩", "공항 픽업만", "공항 샌딩만"] },
    { key: "flight", label: "도착 항공편·시각", type: "text", placeholder: "예) KE787 11:55 도착" },
    { key: "bags", label: "큰 짐 수", type: "number" },
  ],
  tour: [
    { key: "what", label: "원하는 투어", type: "text", placeholder: "예) 유후인·벳푸 1일 버스투어" },
    { key: "date", label: "날짜", type: "date" },
    { key: "kind", label: "방식", type: "select", options: ["조인(여럿이 함께)", "단독(우리끼리)"] },
  ],
  guide: [
    { key: "days", label: "일수", type: "number" },
    { key: "car", label: "차량", type: "select", options: ["승용·밴(~6명)", "미니버스(~20명)", "대형버스(21명~)"] },
    { key: "lang", label: "가이드", type: "select", options: ["한국어 가이드", "기사만(가이드 없이)"] },
  ],
  meals: [
    { key: "what", label: "원하는 식사", type: "text", placeholder: "예) 첫날 저녁 모츠나베, 아이 메뉴" },
    { key: "diet", label: "못 드시는 것", type: "text", placeholder: "예) 해산물 알레르기" },
  ],
  pass: [
    { key: "which", label: "패스", type: "text", placeholder: "예) JR 북규슈 3일권 (모르면 비워 두세요)" },
    { key: "start", label: "사용 시작일", type: "date" },
  ],
  esim: [
    { key: "type", label: "종류", type: "select", options: ["eSIM", "유심(USIM)", "포켓와이파이", "잘 모르겠어요"] },
    { key: "phone", label: "휴대폰", type: "select", options: ["아이폰", "갤럭시", "기타"] },
    { key: "days", label: "사용 일수", type: "number" },
    { key: "data", label: "데이터", type: "select", options: ["무제한", "하루 1GB", "하루 2GB", "총 10GB"] },
    { key: "count", label: "개수", type: "number" },
  ],
  insurance: [
    { key: "people", label: "가입 인원", type: "number" },
    { key: "ages", label: "나이대", type: "text", placeholder: "예) 40대 2, 70대 1, 10세 1" },
    { key: "level", label: "보장", type: "select", options: ["기본", "실속", "든든(의료비 높게)"] },
  ],
};

export const ASK_KIND_LABEL = { quote: "견적 요청", booking: "예약 요청" } as const;

export const serviceRequestSchema = z.object({
  kind: z.enum(["quote", "booking"]),
  items: z
    .array(
      z.object({
        id: z.enum(SERVICE_IDS),
        details: z.record(z.string().max(30), z.string().trim().max(120)).default({}),
      }),
    )
    .min(1)
    .max(SERVICE_IDS.length),
  /** 연락 방법·가능 시간 */
  contactHow: z.string().max(20).default(""),
  contactWhen: z.string().max(40).default(""),
});
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;

/** 항목 한 줄 ("호텔 — 지역 하카타역 주변 · 체크인 2026-12-01 · 4성") — 직원 화면·알림 메일 */
export function askLine(item: ServiceRequest["items"][number]): string {
  const fields = ASK_FIELDS[item.id];
  const parts = fields.map((f) => (item.details[f.key] ? `${f.label} ${item.details[f.key]}` : "")).filter(Boolean);
  return `${SERVICE_LABEL[item.id]}${parts.length ? ` — ${parts.join(" · ")}` : ""}`;
}

/** 직원 [입력에 채우기] — 요청 항목을 견적 입력으로 (항공 포함·상품 구성·호텔 등급·날짜) */
export function askToTripPatch(req: ServiceRequest): Partial<TripInput> {
  const has = (id: ServiceId) => req.items.some((i) => i.id === id);
  const d = (id: ServiceId, key: string) => req.items.find((i) => i.id === id)?.details[key] ?? "";
  const patch: Partial<TripInput> = {
    includesFlights: has("flight"),
    packageType: has("flight") ? "full" : has("hotel") ? "land_hotel" : "land",
  };
  const go = d("flight", "go") || d("hotel", "checkin");
  if (/^\d{4}-\d{2}-\d{2}$/.test(go)) patch.departureDate = go;
  const grade = GRADE[d("hotel", "grade")];
  if (grade) patch.hotelGrade = grade;
  const nights = Number(d("hotel", "nights"));
  if (nights > 0 && nights < 30) {
    patch.nights = nights;
    patch.days = nights + 1;
  }
  return patch;
}
