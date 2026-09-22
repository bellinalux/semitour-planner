import { customerFeeNote, localPaySection, moneyWithKrw } from "@/lib/fees";
import { formatDuration } from "@/lib/format";
import { ITEM_TYPE_META } from "@/lib/itemTypes";
import { pickPmOption } from "@/lib/itinerary";
import type { ItineraryItem, ItemType, TripInput } from "@/types";
import { claimsNoOption, hotelLines as formatHotelLines, includedLabels, type ExportData } from "./exportText";

/**
 * 업체 코스표 스타일(이모지 + 번호 + 화살표) 고객용 텍스트.
 *
 *   DAY 2
 *   🏝️ ① 산호섬
 *   스피드보트 → 해변 자유시간
 *   ↓
 *   🏨 호텔 복귀
 *
 * 원가·마진·경쟁사 정보는 넣지 않는다.
 */

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];

/** 이름에 이런 말이 들어 있으면 유형 기본 이모지 대신 이걸 쓴다 (위에서부터 먼저 맞는 것) */
const NAME_EMOJI: [RegExp, string][] = [
  [/야시장|야경|나이트/, "🌃"],
  [/디너\s*크루즈|크루즈|선상|보트|요트|카약/, "🚢"],
  [/왕궁|궁전|궁$/, "👑"],
  [/사원|사찰|성전|템플|왓\s?\S+|신사|절$/, "🛕"],
  [/박물관|미술관|갤러리/, "🏛️"],
  [/섬|해변|비치|스노클|다이빙/, "🏝️"],
  [/코끼리|동물|사파리|오픈주|동물원|아쿠아리움/, "🦒"],
  [/기차|열차|트램|케이블카/, "🚂"],
  [/루프탑|전망대|스카이/, "🌇"],
  [/폭포|등산|산맥|정글|트레킹|협곡|절벽/, "🌄"],
  [/씨푸드|해산물|랍스터|새우/, "🦐"],
  [/쿠킹|요리|클래스/, "👩‍🍳"],
  [/쇼(?!핑)|공연|카바레|뮤지컬/, "🎭"],
  [/카페|커피|디저트/, "☕"],
  [/시장|마켓|쇼핑몰|아울렛/, "🛍️"],
  [/스파|마사지|힐링/, "💆"],
  [/골프/, "⛳"],
  [/온천/, "♨️"],
];

/** 번호를 붙이는 유형 (이동·숙소·항공 같은 흐름 안내에는 번호를 붙이지 않는다) */
const NUMBERED: ItemType[] = ["sightseeing", "experience", "massage", "shopping", "free_time"];
/** 그냥 "점심", "저녁"처럼 식당이 정해지지 않은 식사는 번호 없이 적는다 */
const GENERIC_MEAL = /^(조식|중식|석식|점심|저녁|아침|식사|자유식|현지식|호텔식)(\s|$|\(|·)/;

function emojiFor(item: ItineraryItem): string {
  const type = item.type ?? "sightseeing";
  if (type === "flight" || type === "transfer" || type === "hotel") return ITEM_TYPE_META[type].emoji;
  const byName = NAME_EMOJI.find(([re]) => re.test(item.name));
  return byName ? byName[1] : ITEM_TYPE_META[type].emoji;
}

function isNumbered(item: ItineraryItem): boolean {
  const type = item.type ?? "sightseeing";
  if (NUMBERED.includes(type)) return true;
  return type === "meal" && !GENERIC_MEAL.test(item.name.trim());
}

function circled(n: number): string {
  return CIRCLED[n - 1] ?? `(${n})`;
}

function detailOf(item: ItineraryItem, input: Pick<TripInput, "currency" | "exchangeRateToKrw">): string {
  const time = item.timeNote
    ? item.timeNote
    : item.admission === "view_only"
      ? "외부 조망"
      : item.stayMinutes > 0 && (item.type ?? "sightseeing") !== "hotel"
        ? `약 ${formatDuration(item.stayMinutes)}`
        : "";
  const parts = [time, customerFeeNote(item, input)].filter(Boolean);
  return parts.length > 0 ? `(${parts.join(" · ")})` : "";
}

/** 항목 목록을 "이모지 ① 이름 / 설명 / ↓" 형태로 그린다. 번호는 하루 안에서 이어진다. */
function itemBlock(items: ItineraryItem[], counter: { n: number }, input: Pick<TripInput, "currency" | "exchangeRateToKrw">): string[] {
  const out: string[] = [];
  items.forEach((item, index) => {
    const number = isNumbered(item) ? `${circled(++counter.n)} ` : "";
    out.push(`${emojiFor(item)} ${number}${item.name} ${detailOf(item, input)}`.trimEnd());
    if (item.description) out.push(item.description);
    if (index < items.length - 1) out.push("↓");
  });
  return out;
}

export function buildEmojiCustomerText(data: ExportData): string {
  const { input, days, pmChoice, quote, meta } = data;
  const s = quote.scenario;

  const isSemi = days.some((d) => d.kind === "semi");
  const labels = [meta?.noShopping ? "노쇼핑" : "", claimsNoOption(input, meta) ? "노옵션" : ""].filter(Boolean);
  const included = includedLabels(quote.ourIncludes, true);
  const localPayLines = localPaySection(days, pmChoice, input, true);
  const excluded = [
    ...includedLabels(quote.ourIncludes, false),
    ...(isSemi ? ["저녁 식사(자유식)"] : []),
    ...(localPayLines.length > 0 ? ["현지 지불 항목(별도 안내 참고)"] : []),
    "개인 경비",
  ];

  const dayLines = days.flatMap((day) => {
    const counter = { n: 0 };
    const head = `DAY ${day.day}${day.theme ? ` · ${day.theme}` : ""}`;
    if (day.kind === "linear") return ["", head, "", ...itemBlock(day.items, counter, input)];

    const pm = pickPmOption(day, pmChoice);
    return [
      "",
      head,
      "",
      "🌅 오전 · 가이드 투어",
      ...itemBlock(day.amGuided, counter, input),
      "",
      `🌇 오후 · 반자유 일정${pm ? ` (${pm.title})` : ""}`,
      ...(pm ? itemBlock(pm.items, counter, input) : []),
    ];
  });

  const optionLines =
    input.options.length > 0
      ? [
          "",
          "🎟️ 선택 옵션 (기본 요금 별도 · 참여 자유)",
          ...input.options.map(
            (o) =>
              `▪ ${o.name}${o.dayNo > 0 ? ` (DAY ${o.dayNo})` : ""} — 1인 ${moneyWithKrw(o.pricePerPerson, input.currency, input.exchangeRateToKrw)} · ${o.minParticipants}명 이상 신청 시 진행`,
          ),
          "※ 옵션에 참여하지 않으시는 경우 자유시간 또는 대체 일정으로 진행됩니다. 옵션은 현지 사정에 따라 변경·취소될 수 있습니다.",
        ]
      : [];

  const hotelLines =
    Object.keys(input.selectedHotels).length > 0 && quote.lodgingUnits > 0
      ? formatHotelLines(input.selectedHotels).map((line) => `🏨 숙소: ${line}`)
      : meta?.hotelGrade
        ? [`🏨 숙소: ${meta.hotelGrade}`]
        : [];

  return [
    `${labels.length > 0 ? `[${labels.join("·")}] ` : ""}${input.destination} ${input.nights}박 ${input.days}일 패키지`,
    `💰 ${quote.travelers}명 기준 1인 ${moneyWithKrw(s.pricePerPerson, input.currency, input.exchangeRateToKrw)} (총 ${moneyWithKrw(s.totalPrice, input.currency, input.exchangeRateToKrw)})`,
    ...(meta && meta.highlights.length > 0 ? [`★ ${meta.highlights.join(" + ")}`] : []),
    ...dayLines,
    ...optionLines,
    ...(localPayLines.length > 0 ? ["", ...localPayLines] : []),
    "",
    ...hotelLines,
    `✅ 포함: ${included.length > 0 ? included.join(", ") : "별도 안내"}`,
    `❌ 불포함: ${excluded.join(", ")}`,
    "※ 입장료와 식대 등은 현지 사정에 따라 변동될 수 있습니다.",
    ...(quote.undecidedLabels.length > 0 ? ["※ 일부 구성 요소의 요금이 확정되지 않아 최종 금액이 달라질 수 있습니다."] : []),
  ]
    .join("\n")
    .trim();
}
