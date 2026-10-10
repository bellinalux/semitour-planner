import { addDays, parseDate, type MealSlot } from "@/lib/documents";
import { conditionTags } from "@/lib/itineraryDoc";
import type { PmChoice } from "@/lib/itinerary";
import type { CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";

/**
 * 외국어 일정표·견적서 (영어·일본어·중국어 간체) — 문서 틀 글자는 여기 사전으로, 일정 이름·설명 같은 한글 글은 번역표로 바꾼다.
 * 날짜·금액은 그 언어 표기(Intl)로.
 */

export type DocLang = "en" | "ja" | "zh";

export const LOCALE: Record<DocLang, string> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };

interface Dict {
  docTitle: string;
  issued: string;
  tour: string;
  destination: string;
  dates: string;
  travelers: string;
  minGroup: string;
  minGroupNote: (n: number) => string;
  nightsDays: (n: number, d: number) => string;
  price: string;
  pricePerPerson: string;
  twin: string;
  totalFor: (n: number) => string;
  single: (v: string) => string;
  flights: string;
  leg: string;
  flight: string;
  departure: string;
  arrival: string;
  outbound: string;
  return: string;
  tba: string;
  meeting: string;
  meetingDefault: (origin: string) => string;
  dayByDay: string;
  cols: [string, string, string, string, string, string];
  dayN: (n: number) => string;
  vehicle: string;
  transfer: string;
  afterBreakfast: string;
  freeDay: string;
  freeDayNote: string;
  suggested: string;
  morning: string;
  afternoon: string;
  morningFree: string;
  restPm: string;
  checkinRest: string;
  approx: (d: string) => string;
  returnFlight: string;
  hotelMeeting: string;
  mealPrefix: [string, string, string];
  hotelLine: (name: string) => string;
  hotelIn: (city: string) => string;
  checkInOut: string;
  changeNote: string;
  legend: string;
  styles: { 입장: string; 하차: string; 차창: string };
  kinds: Record<string, string>;
  included: string;
  notIncluded: string;
  incExc: string;
  tips: string;
  tipsIncluded: (v: string) => string;
  tipsLocal: string;
  shopping: string;
  noShopping: string;
  shops: (n: number) => string;
  options: string;
  noOptions: string;
  optCols: [string, string, string, string];
  optRuns: (n: number) => string;
  optDefaultAlt: string;
  paidLocally: string;
  info: string;
  infoLabels: [string, string, string, string, string, string, string];
  cancel: string;
  cancelIntro: string;
  cancelTerms: string[];
  footer: string;
  contact: string;
  emergency: string;
  meals: { hotel: string; local: string; special: string; korean: string; own: string; inflight: string; paidLocal: string };
  duration: (h: number, m: number) => string;
  tags: { noShop: string; shop: (n: string) => string; noOpt: string; opt: (n: string) => string; tipsIn: string; tipsLocal: string; meals: (n: string) => string; vehicle: string; resort: string; star: (a: string, b?: string) => string };
}

export const DICT: Record<DocLang, Dict> = {
  en: {
    docTitle: "Itinerary & Quotation",
    issued: "Issued",
    tour: "Tour",
    destination: "Destination",
    dates: "Dates",
    travelers: "Travelers",
    minGroup: "Minimum group",
    minGroupNote: (n) => `${n} (notified 7 days before departure if not met)`,
    nightsDays: (n, d) => `${n} night${n === 1 ? "" : "s"} / ${d} day${d === 1 ? "" : "s"}`,
    price: "Price",
    pricePerPerson: "Price per person",
    twin: " (twin sharing)",
    totalFor: (n) => `Total for ${n}`,
    single: (v) => `Single room supplement: +${v} per person`,
    flights: "Flights & meeting",
    leg: "Leg",
    flight: "Flight",
    departure: "Departure",
    arrival: "Arrival",
    outbound: "Outbound",
    return: "Return",
    tba: "TBA",
    meeting: "Meeting",
    meetingDefault: (o) => `${o} Airport, 3 hours before departure (exact counter will be sent 2–3 days before)`,
    dayByDay: "Day-by-day itinerary",
    cols: ["Day", "Area", "Transport", "Time", "Schedule", "Meals"],
    dayN: (n) => `Day ${n}`,
    vehicle: "Private vehicle",
    transfer: "Transfer",
    afterBreakfast: "After breakfast",
    freeDay: "Free day",
    freeDayNote: "(no guide or vehicle)",
    suggested: "Suggested",
    morning: "Morning · guided tour",
    afternoon: "Afternoon · free choice",
    morningFree: "Free morning (rest at the hotel)",
    restPm: "Free afternoon (rest at the hotel or explore on your own)",
    checkinRest: "Hotel check-in and free time",
    approx: (d) => `approx. ${d}`,
    returnFlight: "Arrive at the airport 2–3 hours before departure for check-in",
    hotelMeeting: "Meet at the hotel lobby and depart",
    mealPrefix: ["B", "L", "D"],
    hotelLine: (n) => `HOTEL: ${n} or similar`,
    hotelIn: (c) => `Hotel in ${c}`,
    checkInOut: "check-in 15:00 / check-out around 11:00 (hotel policy)",
    changeNote: "The order and times may change due to flights or local conditions (traffic, weather, opening hours); we will inform you and ask for your consent before any change. Only key times are shown.",
    legend: "Entry: inside visit · Photo stop: outside visit · Drive-by: seen from the vehicle",
    styles: { 입장: "Entry", 하차: "Photo stop", 차창: "Drive-by" },
    kinds: { sightseeing: "Sightseeing", experience: "Activity", massage: "Spa", shopping: "Shopping", meal: "Meal", hotel: "Hotel", free_time: "Free time", flight: "Flight" },
    included: "Included",
    notIncluded: "Not included",
    incExc: "Included / Not included",
    tips: "Guide & driver tips",
    tipsIncluded: (v) => `Included in the tour price (${v} per person). No extra tips are requested.`,
    tipsLocal: "Not included. Please pay the guide directly at the destination; the amount will be advised before departure.",
    shopping: "Shopping",
    noShopping: "No shopping stops in this itinerary.",
    shops: (n) => `${n} shopping stop${n > 1 ? "s" : ""} — purchases are entirely optional.`,
    options: "Optional tours",
    noOptions: "No optional tours.",
    optCols: ["Day", "Tour", "Per person", "If not joining"],
    optRuns: (n) => `Runs with ${n}+ people`,
    optDefaultAlt: "Free time at a place advised by the guide, then rejoin the group (no extra cost)",
    paidLocally: "paid locally",
    info: "Travel information",
    infoLabels: ["Time difference", "Voltage", "Currency", "Entry (Korean passport)", "Weather", "Emergency", "Korean embassy / consulate"],
    cancel: "Cancellation",
    cancelIntro: "Cancellation fees follow the Korean standard terms for overseas travel (based on days before departure):",
    cancelTerms: ["Up to 30 days before — deposit refunded (no fee)", "29–20 days before — 10% of the tour price", "19–10 days before — 15%", "9–8 days before — 20%", "7–1 days before — 30%", "On the day of departure or later — 50%"],
    footer: "Prices are subject to availability at the time of booking.",
    contact: "Contact",
    emergency: "Emergency",
    meals: { hotel: "Hotel", local: "Local", special: "Special", korean: "Korean", own: "Own expense", inflight: "In-flight or own expense", paidLocal: "paid locally" },
    duration: (h, m) => (h > 0 ? `${h} hr${m ? ` ${m} min` : ""}` : `${m} min`),
    tags: { noShop: "No shopping stops", shop: (n) => `Shopping stops: ${n}`, noOpt: "No optional tours", opt: (n) => `Optional tours: ${n} (free choice)`, tipsIn: "Guide & driver tips included", tipsLocal: "Guide tips paid locally", meals: (n) => `${n} meals included`, vehicle: "Private vehicle", resort: "Resort", star: (a, b) => (b ? `${a}–${b} star hotel` : `${a}-star hotel`) },
  },
  ja: {
    docTitle: "旅行日程表・お見積り",
    issued: "発行日",
    tour: "ツアー名",
    destination: "旅行先",
    dates: "旅行期間",
    travelers: "人数",
    minGroup: "最少催行人員",
    minGroupNote: (n) => `${n}名（未達の場合は出発7日前までにご連絡）`,
    nightsDays: (n, d) => `${n}泊${d}日`,
    price: "旅行代金",
    pricePerPerson: "お一人様",
    twin: "（2名1室利用）",
    totalFor: (n) => `${n}名様合計`,
    single: (v) => `1名1室利用追加代金：お一人様 +${v}`,
    flights: "航空便・集合",
    leg: "区間",
    flight: "便名",
    departure: "出発",
    arrival: "到着",
    outbound: "往路",
    return: "復路",
    tba: "確定後ご案内",
    meeting: "集合",
    meetingDefault: (o) => `出発3時間前に${o}空港（カウンター位置は出発2〜3日前にご案内）`,
    dayByDay: "日程表",
    cols: ["日次", "地域", "交通", "時間", "スケジュール", "食事"],
    dayN: (n) => `${n}日目`,
    vehicle: "専用車",
    transfer: "移動",
    afterBreakfast: "朝食後",
    freeDay: "終日自由行動",
    freeDayNote: "（ガイド・車両なし）",
    suggested: "おすすめ",
    morning: "午前・ガイド付き観光",
    afternoon: "午後・自由選択",
    morningFree: "午前は自由行動（ホテルでご休憩）",
    restPm: "午後は自由行動（ホテルでご休憩または個人観光）",
    checkinRest: "ホテルチェックイン後、自由行動",
    approx: (d) => `約${d}`,
    returnFlight: "出発の2〜3時間前に空港到着・搭乗手続き",
    hotelMeeting: "ホテルロビー集合後出発",
    mealPrefix: ["朝", "昼", "夕"],
    hotelLine: (n) => `ホテル：${n}または同等クラス`,
    hotelIn: (c) => `${c}市内ホテル`,
    checkInOut: "チェックイン15:00 / チェックアウト11:00頃（ホテル規定）",
    changeNote: "上記日程は航空便や現地事情（交通・天候・営業時間）により順序・時間が変更となる場合があります。変更の際は事前にご案内し、同意をいただきます。主な時間のみ記載しています。",
    legend: "入場：館内見学 ・ 下車：外観見学・写真 ・ 車窓：車内から見学",
    styles: { 입장: "入場", 하차: "下車", 차창: "車窓" },
    kinds: { sightseeing: "観光", experience: "体験", massage: "スパ", shopping: "ショッピング", meal: "食事", hotel: "ホテル", free_time: "自由時間", flight: "航空" },
    included: "含まれるもの",
    notIncluded: "含まれないもの",
    incExc: "代金に含まれるもの・含まれないもの",
    tips: "ガイド・ドライバーのチップ",
    tipsIncluded: (v) => `旅行代金に含まれています（お一人様 ${v}）。現地で別途お支払いは不要です。`,
    tipsLocal: "旅行代金に含まれていません。現地でガイドへ直接お支払いください。金額は出発前にご案内します。",
    shopping: "ショッピング",
    noShopping: "日程にショッピング店への立ち寄りはありません。",
    shops: (n) => `ショッピング店立ち寄り${n}回（ご購入は自由です）`,
    options: "オプショナルツアー",
    noOptions: "オプショナルツアーはありません。",
    optCols: ["日次", "ツアー", "お一人様", "不参加の場合"],
    optRuns: (n) => `${n}名以上で催行`,
    optDefaultAlt: "ガイドが案内する場所で自由時間の後に合流（追加費用なし）",
    paidLocally: "現地払い",
    info: "旅行情報",
    infoLabels: ["時差", "電圧", "通貨", "入国条件（韓国旅券）", "天気", "緊急連絡", "韓国大使館・総領事館"],
    cancel: "取消料",
    cancelIntro: "韓国の海外旅行標準約款に基づきます（出発日基準）：",
    cancelTerms: ["30日前まで — 申込金返金（取消料なし）", "29〜20日前 — 旅行代金の10%", "19〜10日前 — 15%", "9〜8日前 — 20%", "7〜1日前 — 30%", "出発当日以降 — 50%"],
    footer: "代金はご予約時点の空き状況により変わる場合があります。",
    contact: "お問い合わせ",
    emergency: "緊急",
    meals: { hotel: "ホテル", local: "現地料理", special: "特別料理", korean: "韓国料理", own: "各自", inflight: "機内食または各自", paidLocal: "現地払い" },
    duration: (h, m) => (h > 0 ? `${h}時間${m ? `${m}分` : ""}` : `${m}分`),
    tags: { noShop: "ショッピングなし", shop: (n) => `ショッピング${n}回`, noOpt: "オプションなし", opt: (n) => `オプション${n}件（自由選択）`, tipsIn: "ガイドチップ込み", tipsLocal: "ガイドチップ現地払い", meals: (n) => `食事${n}回付き`, vehicle: "専用車", resort: "リゾート", star: (a, b) => (b ? `${a}〜${b}つ星ホテル` : `${a}つ星ホテル`) },
  },
  zh: {
    docTitle: "行程表及报价",
    issued: "出具日期",
    tour: "线路",
    destination: "目的地",
    dates: "日期",
    travelers: "人数",
    minGroup: "最低成团人数",
    minGroupNote: (n) => `${n}人（未成团将于出发前7天通知）`,
    nightsDays: (n, d) => `${d}天${n}晚`,
    price: "价格",
    pricePerPerson: "每人价格",
    twin: "（两人一间）",
    totalFor: (n) => `${n}人合计`,
    single: (v) => `单房差：每人 +${v}`,
    flights: "航班及集合",
    leg: "航段",
    flight: "航班",
    departure: "出发",
    arrival: "到达",
    outbound: "去程",
    return: "回程",
    tba: "确认后通知",
    meeting: "集合",
    meetingDefault: (o) => `航班起飞前3小时于${o}机场集合（具体柜台出发前2–3天通知）`,
    dayByDay: "每日行程",
    cols: ["日期", "地区", "交通", "时间", "行程", "餐食"],
    dayN: (n) => `第${n}天`,
    vehicle: "专车",
    transfer: "移动",
    afterBreakfast: "早餐后",
    freeDay: "全天自由活动",
    freeDayNote: "（无导游、无用车）",
    suggested: "推荐",
    morning: "上午·导游带领",
    afternoon: "下午·自由选择",
    morningFree: "上午自由活动（酒店休息）",
    restPm: "下午自由活动（酒店休息或自行游览）",
    checkinRest: "酒店入住后自由活动",
    approx: (d) => `约${d}`,
    returnFlight: "请于起飞前2–3小时抵达机场办理登机",
    hotelMeeting: "酒店大堂集合后出发",
    mealPrefix: ["早", "午", "晚"],
    hotelLine: (n) => `酒店：${n}或同级`,
    hotelIn: (c) => `${c}市区酒店`,
    checkInOut: "入住15:00 / 退房约11:00（以酒店规定为准）",
    changeNote: "以上行程可能因航班或当地情况（交通、天气、开放时间）调整顺序及时间，调整前将提前告知并征得您的同意。表中仅列主要时间。",
    legend: "入内：入内参观 · 下车：外观参观拍照 · 车览：车上观看",
    styles: { 입장: "入内", 하차: "下车", 차창: "车览" },
    kinds: { sightseeing: "游览", experience: "体验", massage: "水疗", shopping: "购物", meal: "用餐", hotel: "酒店", free_time: "自由活动", flight: "航班" },
    included: "费用包含",
    notIncluded: "费用不含",
    incExc: "费用包含 / 不含",
    tips: "导游司机小费",
    tipsIncluded: (v) => `已含在团费中（每人 ${v}），当地无需另付。`,
    tipsLocal: "不含在团费中，请在当地直接支付给导游，金额出发前告知。",
    shopping: "购物",
    noShopping: "行程中无购物店。",
    shops: (n) => `购物店${n}处（购买完全自愿）`,
    options: "自费项目",
    noOptions: "无自费项目。",
    optCols: ["日期", "项目", "每人", "不参加时"],
    optRuns: (n) => `${n}人以上成行`,
    optDefaultAlt: "在导游指定地点自由活动后汇合（无额外费用）",
    paidLocally: "当地支付",
    info: "旅行信息",
    infoLabels: ["时差", "电压", "货币", "入境条件（韩国护照）", "天气", "紧急电话", "韩国大使馆/总领事馆"],
    cancel: "取消规定",
    cancelIntro: "依据韩国海外旅行标准条款（以出发日为准）：",
    cancelTerms: ["出发前30天以前 — 退还定金（无违约金）", "出发前29–20天 — 团费的10%", "出发前19–10天 — 15%", "出发前9–8天 — 20%", "出发前7–1天 — 30%", "出发当天及以后 — 50%"],
    footer: "价格以预订时的实际情况为准。",
    contact: "联系方式",
    emergency: "紧急",
    meals: { hotel: "酒店", local: "当地餐", special: "特色餐", korean: "韩餐", own: "自理", inflight: "飞机餐或自理", paidLocal: "当地支付" },
    duration: (h, m) => (h > 0 ? `${h}小时${m ? `${m}分钟` : ""}` : `${m}分钟`),
    tags: { noShop: "无购物", shop: (n) => `购物${n}处`, noOpt: "无自费", opt: (n) => `自费项目${n}个（自愿）`, tipsIn: "含导游小费", tipsLocal: "导游小费当地付", meals: (n) => `含${n}餐`, vehicle: "专车", resort: "度假村", star: (a, b) => (b ? `${a}–${b}星级酒店` : `${a}星级酒店`) },
  },
};

export function foreignDuration(lang: DocLang, minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return DICT[lang].duration(Math.floor(m / 60), m % 60);
}

export function foreignDate(lang: DocLang, date: Date): string {
  return date.toLocaleDateString(LOCALE[lang], { month: "short", day: "numeric", year: "numeric", weekday: "short" });
}

export function foreignPeriod(lang: DocLang, input: Pick<TripInput, "departureDate" | "days">): string {
  const start = parseDate(input.departureDate);
  if (!start) return DICT[lang].tba;
  return `${foreignDate(lang, start)} – ${foreignDate(lang, addDays(start, Math.max(0, input.days - 1)))}`;
}

export function foreignDayDate(lang: DocLang, input: Pick<TripInput, "departureDate">, dayNo: number): string | null {
  const start = parseDate(input.departureDate);
  return start ? foreignDate(lang, addDays(start, dayNo - 1)) : null;
}

export function foreignMoney(lang: DocLang, value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(LOCALE[lang], { style: "currency", currency, maximumFractionDigits: ["KRW", "JPY", "VND"].includes(currency) ? 0 : 2 }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString(LOCALE[lang])} ${currency}`;
  }
}

const SPECIAL = /특식|씨푸드|랍스터|스테이크|코스|뷔페|BBQ|바비큐|샤브|훠궈/i;

export function foreignMeal(lang: DocLang, slot: MealSlot, kind: "breakfast" | "lunch" | "dinner", flightDay: boolean, fullPackage: boolean, t: (s: string) => string): string {
  const M = DICT[lang].meals;
  if (slot.mark === "호텔식") return M.hotel;
  if (slot.mark === "불포함") {
    if (kind === "breakfast") return "—";
    return flightDay && fullPackage ? M.inflight : M.own;
  }
  const c = slot.cuisine.trim();
  const base = SPECIAL.test(c) ? `${M.special} (${t(c)})` : /한식/.test(c) ? M.korean : c ? `${M.local} (${t(c)})` : M.local;
  return slot.mark === "현지 지불" ? `${base}, ${M.paidLocal}` : base;
}

export function foreignTags(lang: DocLang, d: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice; meta: CourseMeta | null; quote: QuoteData }): string[] {
  const T = DICT[lang].tags;
  const num = (s: string) => s.replace(/\D/g, "");
  return conditionTags(d.input, d.days, d.pmChoice, d.meta, d.quote).map((tag) => {
    if (tag === "노쇼핑") return T.noShop;
    if (tag.startsWith("쇼핑 ")) return T.shop(num(tag));
    if (tag === "노옵션") return T.noOpt;
    if (tag.startsWith("선택관광")) return T.opt(num(tag));
    if (tag.startsWith("가이드 경비 포함")) return T.tipsIn;
    if (tag.startsWith("가이드 경비 현지")) return T.tipsLocal;
    if (tag.startsWith("식사")) return T.meals(num(tag));
    if (tag === "전용차량") return T.vehicle;
    if (tag === "리조트") return T.resort;
    const star = /^(\d)(?:~(\d))?성급$/.exec(tag);
    if (star) return T.star(star[1], star[2]);
    return tag;
  });
}
