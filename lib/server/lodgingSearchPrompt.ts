import { HOTEL_GRADE_QUERY } from "@/lib/itemTypes";
import type { LodgingWebRequest } from "@/lib/schemas/lodgingSearch";

/** 1단계: Google 검색으로 숙박 요금을 조사하는 요청 (자유 서술) */
export function buildLodgingResearchPrompt(req: LodgingWebRequest): string {
  const unitLine =
    req.lodgingType === "bnb"
      ? "에어비앤비·아파트형 숙소(BnB) 1유닛(4인 기준)의 1박 요금"
      : `${HOTEL_GRADE_QUERY[req.hotelGrade]} 호텔 2인 1실의 1박 요금`;

  return [
    `Google 검색 도구를 여러 번 사용해서, "${req.destination}"의 ${unitLine}을 조사해 주세요.`,
    "Booking.com, Agoda, 네이버 호텔, Hotels.com, 야놀자(해외 숙소) 등 숙박 예약 사이트의 검색 결과 페이지에 실제로 표시된 요금을 찾으세요.",
    "기억에 의존해 요금을 지어내지 말고, 검색으로 확인한 범위만 적으세요. 확인하지 못했으면 '확인 못함'이라고 쓰세요.",
    "",
    "아래 항목을 조사 메모로 정리해 주세요.",
    "1. 1박 요금 범위 (최저가~평균가, 세금·봉사료 포함인지, 조식 포함 여부도 적기)",
    "2. 요금을 확인한 사이트 이름",
    "3. 추천할 만한 숙박 지역·구역 (교통이 편하거나 관광지에 가까운 곳)",
    "4. 숙박세·관광세가 있는지, 있다면 1인 1박 금액",
    "5. 요금 관련 유의사항",
  ].join("\n");
}

export const LODGING_STRUCTURE_SYSTEM_PROMPT = `당신은 숙박 요금 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 내용만 사용합니다. 메모에 없는 금액이나 사실을 새로 만들지 않습니다.
- 메모에서 '확인 못함'이라고 한 항목은 비워 둡니다: 문자열은 빈 문자열, 요금은 0.
- basis는 메모가 검색 결과 페이지에서 실제 요금을 확인했다고 한 경우에만 searched이고, 그렇지 않으면 estimated입니다. estimated이면 rateLow/High에는 메모에 적힌 대략적인 값(없으면 통상 시세)을 넣습니다.
- 요금은 숫자만 넣고 통화 기호나 쉼표는 넣지 않습니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

/** 2단계: 조사 메모를 JSON으로 정리하는 요청 */
export function buildLodgingStructurePrompt(req: LodgingWebRequest, memo: string): string {
  return [
    `요청 통화: ${req.currency} (rateLow, rateHigh는 이 통화 단위의 숫자)`,
    `여행지: ${req.destination}`,
    `숙소 유형: ${req.lodgingType === "bnb" ? "BnB·아파트 1유닛(4인)" : `호텔 2인 1실, ${HOTEL_GRADE_QUERY[req.hotelGrade]}`}`,
    "",
    "<research_memo>",
    memo,
    "</research_memo>",
    "",
    "위 조사 메모를 스키마에 맞게 정리해 주세요.",
  ].join("\n");
}
