import { dayItems, pickPmOption, type PmChoice } from "@/lib/itinerary";
import { isLocalPay } from "@/lib/fees";
import type { CompanyProfile, DayPlan, ItineraryItem, QuoteData, TripInput } from "@/types";

/** ---------- 날짜 ---------- */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function parseDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}(${WEEKDAYS[date.getDay()]})`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatToday(): string {
  return formatDate(new Date());
}

/** "2026.11.03(화) ~ 2026.11.07(토)" — 출발일이 없으면 "미정" */
export function tripPeriod(input: Pick<TripInput, "departureDate" | "days">): string {
  const start = parseDate(input.departureDate);
  if (!start) return "미정";
  const end = addDays(start, Math.max(0, input.days - 1));
  return `${formatDate(start)} ~ ${formatDate(end)}`;
}

/** 일차별 날짜. 출발일이 없으면 null */
export function dayDate(input: Pick<TripInput, "departureDate">, dayNo: number): string | null {
  const start = parseDate(input.departureDate);
  return start ? formatDate(addDays(start, dayNo - 1)) : null;
}

/** ---------- 식사 표기 (조·중·석) ---------- */

export type MealMark = "호텔식" | "포함" | "현지 지불" | "불포함";

/** 한 끼 표기: 포함 상태 + 음식 종류(현지식·한식 등, 없으면 빈 문자열) */
export interface MealSlot {
  mark: MealMark;
  cuisine: string;
}

export interface DayMeals {
  breakfast: MealSlot;
  lunch: MealSlot;
  dinner: MealSlot;
}

const DINNER = /저녁|석식|디너|dinner|야식/i;
const LUNCH = /점심|중식|런치|lunch/i;
const BREAKFAST = /아침|조식|브런치|breakfast/i;

/**
 * 식사 항목인가. type이 "meal"이면 확실하고, AI 세미투어 항목처럼 type이 없으면
 * 식대가 있거나 이름이 조/중/석 표현과 일치할 때만 식사로 본다(관광 항목과 구분하기 위함).
 */
function looksLikeMeal(item: ItineraryItem): boolean {
  if (item.type === "meal") return true;
  if (item.type !== undefined) return false;
  return item.mealCost > 0 || DINNER.test(item.name) || LUNCH.test(item.name) || BREAKFAST.test(item.name);
}

function slotOf(item: ItineraryItem): MealSlot {
  return { mark: isLocalPay(item) ? "현지 지불" : "포함", cuisine: item.cuisine?.trim() || "" };
}

/**
 * 하루의 조·중·석 표기를 만든다.
 * 조식은 전날 숙박이 있고 조식 포함 설정이 켜져 있으면 호텔식으로 본다. 중·석은 식사 항목
 * 이름으로 나누고, 이름으로 구분되지 않는 식사는 점심 → 저녁 순으로 채운다.
 */
export function dayMeals(
  days: DayPlan[],
  index: number,
  pmChoice: PmChoice,
  input: Pick<TripInput, "packageType" | "breakfastIncluded">,
): DayMeals {
  const day = days[index];
  const previous = index > 0 ? days[index - 1] : null;
  const stayedLastNight = previous !== null && (previous.overnightCity ?? "").trim() !== "";
  const hotelBreakfast = stayedLastNight && input.packageType !== "land" && input.breakfastIncluded;
  const meals: DayMeals = {
    breakfast: { mark: hotelBreakfast ? "호텔식" : "불포함", cuisine: "" },
    lunch: { mark: "불포함", cuisine: "" },
    dinner: { mark: "불포함", cuisine: "" },
  };
  if (!day) return meals;

  const items = dayItems(day, pmChoice).filter(looksLikeMeal);
  const rest: ItineraryItem[] = [];
  for (const item of items) {
    if (DINNER.test(item.name)) meals.dinner = slotOf(item);
    else if (LUNCH.test(item.name)) meals.lunch = slotOf(item);
    else if (BREAKFAST.test(item.name)) meals.breakfast = slotOf(item);
    else rest.push(item);
  }
  for (const item of rest) {
    if (meals.lunch.mark === "불포함") meals.lunch = slotOf(item);
    else if (meals.dinner.mark === "불포함") meals.dinner = slotOf(item);
  }
  return meals;
}

/** 그날 보여줄 일정 항목 (세미투어는 오전 + 선택한 오후 코스) */
export function documentItems(day: DayPlan, pmChoice: PmChoice): { label: string; items: ItineraryItem[] }[] {
  if (day.kind === "linear") return [{ label: "", items: day.items }];
  const pm = pickPmOption(day, pmChoice);
  return [
    { label: "오전 · 가이드 투어", items: day.amGuided },
    ...(pm ? [{ label: `오후 · 반자유 일정 (${pm.title})`, items: pm.items }] : []),
  ];
}

/** ---------- 취소·환불 ---------- */

/** 국외여행 표준약관이 인용하는 소비자분쟁해결기준(여행 개시일 기준) */
export const CANCELLATION_TERMS: { when: string; fee: string }[] = [
  { when: "여행개시 30일 전까지 (~30일)", fee: "계약금 환급 (위약금 없음)" },
  { when: "여행개시 29일 전 ~ 20일 전", fee: "여행요금의 10%" },
  { when: "여행개시 19일 전 ~ 10일 전", fee: "여행요금의 15%" },
  { when: "여행개시 9일 전 ~ 8일 전", fee: "여행요금의 20%" },
  { when: "여행개시 7일 전 ~ 1일 전", fee: "여행요금의 30%" },
  { when: "여행 당일 이후", fee: "여행요금의 50%" },
];

/** ---------- 대금 ---------- */

export interface InterimPaymentPlan {
  amount: number;
  rate: number;
  /** 중도금 납부 기한 (출발일이 있으면 그 날짜) */
  due: string;
}

export interface PaymentPlan {
  total: number;
  deposit: number;
  depositRate: number;
  /** 중도금을 쓰지 않으면 undefined */
  interim?: InterimPaymentPlan;
  balance: number;
  /** 잔금 납부 기한 (출발일이 있으면 그 날짜) */
  balanceDue: string;
  /** 잔금 납부 기한이 표준약관 기본값(출발 7일 전)과 다르거나 중도금을 쓰면 true — 계약서에 특약 고지가 필요하다 */
  isCustomSchedule: boolean;
}

export function paymentPlan(
  total: number,
  company: Pick<CompanyProfile, "depositRate" | "balanceDueDaysBeforeDeparture" | "useInterimPayment" | "interimPaymentRate" | "interimPaymentDaysBeforeDeparture">,
  input: Pick<TripInput, "departureDate">,
): PaymentPlan {
  const depositRate = Math.min(10, Math.max(0, company.depositRate));
  const deposit = Math.round((total * depositRate) / 100);
  const start = parseDate(input.departureDate);
  const dueText = (daysBefore: number) => (start ? `${formatDate(addDays(start, -daysBefore))}까지` : `출발 ${daysBefore}일 전까지`);

  const balanceDueDays = Math.max(0, Math.round(company.balanceDueDaysBeforeDeparture || 0)) || 7;

  let interim: InterimPaymentPlan | undefined;
  let balance = Math.max(0, total - deposit);
  if (company.useInterimPayment && company.interimPaymentRate > 0) {
    const interimRate = Math.min(100 - depositRate, Math.max(0, company.interimPaymentRate));
    const interimAmount = Math.round((total * interimRate) / 100);
    // 중도금은 잔금보다 출발일에서 더 먼 날짜(더 일찍)에 받아야 한다
    const interimDays = Math.max(balanceDueDays + 1, Math.round(company.interimPaymentDaysBeforeDeparture || 0) || 30);
    interim = { amount: interimAmount, rate: interimRate, due: dueText(interimDays) };
    balance = Math.max(0, balance - interimAmount);
  }

  return {
    total,
    deposit,
    depositRate,
    interim,
    balance,
    balanceDue: dueText(balanceDueDays),
    isCustomSchedule: !!interim || balanceDueDays !== 7,
  };
}

/** ---------- 포함·불포함 ---------- */

const INCLUDE_LABELS: Record<string, string> = {
  guide: "가이드",
  meals: "식사",
  admission: "입장료",
  vehicle: "전용 차량",
  hotel: "숙박",
  flight: "왕복 항공",
};

/**
 * 포함·불포함 목록. 대형 여행사(하나투어·모두투어 등) 상품 페이지가 공통으로 밝히는 항목을 따른다.
 * "가이드·기사 경비(팁)"와 "여행자보험"은 포함/불포함 어느 쪽이든 반드시 밝히는 항목이라
 * 팁·보험료를 0원 넘게 입력했으면 포함, 아니면 불포함(개인 가입 권장)으로 표시한다.
 */
export function includeLists(quote: QuoteData, input: TripInput, hasLocalPay: boolean): { included: string[]; excluded: string[] } {
  const keys = Object.keys(INCLUDE_LABELS) as (keyof typeof quote.ourIncludes)[];
  const included = keys.filter((k) => quote.ourIncludes[k]).map((k) => INCLUDE_LABELS[k]);
  const excluded = keys.filter((k) => !quote.ourIncludes[k]).map((k) => INCLUDE_LABELS[k]);
  if (input.tipPerPerson > 0) included.push("가이드·기사 경비(팁)");
  else excluded.push("가이드·기사 경비(팁, 현지 지불)");
  if (input.insurancePerPerson > 0) included.push("여행자보험");
  else excluded.push("여행자보험(개인 가입 권장)");
  if (hasLocalPay) excluded.push("현지 지불 항목(별도 안내)");
  if (input.options.length > 0) excluded.push("선택 옵션 요금");
  excluded.push("개인 경비");
  return { included, excluded };
}

/** ---------- 유의사항 ---------- */

/** 법정 고지와 관행 안내를 합친 문장들 */
export function noticeLines(input: TripInput, company: CompanyProfile): string[] {
  const lines: string[] = [];
  if (input.minTravelers > 0) {
    lines.push(
      `최저 행사인원은 ${input.minTravelers}명입니다. 인원 미달로 여행이 취소되는 경우 여행개시 7일 전까지 통지해 드립니다.`,
    );
  }
  lines.push("여행일정표에 명시된 숙박·교통·일정(선택관광 포함)을 변경할 때는 해당 일정을 시작하기 전에 여행자의 서면 동의를 받습니다.");
  lines.push("여행 전 외교부 해외안전여행(0404.go.kr)에서 여행경보단계와 국가별 안전정보를 확인하시고, 해외여행자 인터넷 등록제(동행) 가입을 권장합니다.");
  lines.push("여권 잔여 유효기간은 입국일 기준 6개월 이상이어야 하며, 국가별 비자 요건은 별도 확인이 필요합니다.");
  if (company.travelerInsurance.trim()) lines.push(company.travelerInsurance.trim());
  lines.push("현지 사정(기상, 교통, 휴관일 등)에 따라 일정의 순서가 바뀔 수 있으며, 이 경우에도 동일 수준의 대체 일정으로 진행합니다.");
  return lines;
}

/** ---------- 수신처(견적서·계약서를 몇 부, 누구 앞으로 만들지) ---------- */

export interface DocRecipient {
  /** 수신 이름 (단체 문서는 customerName, 개인별 문서는 각 여행자 이름) */
  name: string;
  personCount: number;
  pricePerPerson: number;
  totalPrice: number;
}

/**
 * 견적서·계약서를 몇 부 만들지 정한다.
 * travelerNames를 입력했으면(개인별) 사람마다 1인 기준 문서 하나씩, 아니면(단체) 전체 인원 문서 한 부.
 */
export function resolveRecipients(input: Pick<TripInput, "customerName" | "travelerNames">, quote: QuoteData): DocRecipient[] {
  const names = input.travelerNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    return [{ name: input.customerName.trim() || "-", personCount: quote.travelers, pricePerPerson: quote.scenario.pricePerPerson, totalPrice: quote.scenario.totalPrice }];
  }
  return names.map((name) => ({ name, personCount: 1, pricePerPerson: quote.scenario.pricePerPerson, totalPrice: quote.scenario.pricePerPerson }));
}
