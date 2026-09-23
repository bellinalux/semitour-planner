import { z } from "zod";
import type { FeeCheckResult, VerifyFeesRequest, VerifyFeesResponse } from "@/lib/schemas/market";
import { krwPerUnit } from "./fx";
import { generateGroundedText, generateJson } from "./gemini";

function researchPrompt(req: VerifyFeesRequest): string {
  const lines = req.items.map((item) => `- [${item.id}] ${item.name}${item.city ? ` (${item.city})` : ""}`);
  return [
    `Google 검색 도구를 여러 번 사용해서, ${req.destination} 여행 일정에 들어가는 아래 장소·체험의 "외국인(관광객) 성인 1인 입장료 또는 체험 요금"을 정확히 확인해 주세요.`,
    "공식 사이트, 공식 예매처, 관광청, 신뢰할 수 있는 예약 플랫폼을 우선하고, 기억이나 추측으로 금액을 쓰지 마세요.",
    "",
    "확인할 항목 (대괄호 안이 항목 ID입니다. 메모에 ID를 그대로 적어 주세요):",
    ...lines,
    "",
    "항목마다 아래를 조사 메모로 정리하세요. 검색으로 확인하지 못한 것은 '확인 못함'이라고 쓰세요.",
    "1. 항목 ID와 이름",
    "2. 현지 통화(ISO 4217 코드)로 된 외국인 성인 1인 요금. 내국인 요금과 다르면 외국인 요금을 적으세요.",
    "3. 무료 입장이 확실하면 '무료'라고 쓰세요 (무료 여부를 모르면 '확인 못함').",
    "4. 요금을 확인한 사이트 이름",
    "5. 유의사항 한 줄: 현장 현금 결제만 가능, 예약 필수, 요금이 시즌·요일별로 다름, 휴무일, 외국인 요금이 따로 있음 등",
    "6. 관광객들이 그 장소에서 보통 머무르는 시간(체류·관람 소요 시간, 분 단위). 공식 사이트·여행 후기·가이드북에서 안내하는 통상적인 소요 시간을 찾아 적으세요. 확인 못했으면 '확인 못함'이라고 쓰세요.",
    "",
    "여러 요금이 있으면(예: 패키지별, 시간대별) 가장 기본이 되는 성인 1인 요금을 적고 나머지는 유의사항에 쓰세요.",
  ].join("\n");
}

const SYSTEM = `당신은 입장료 조사 메모를 JSON으로 정리하는 편집자입니다.

[원칙]
- 조사 메모에 있는 내용만 사용합니다. 메모에 없는 금액을 새로 만들지 않습니다.
- 항목마다 메모에 적힌 항목 ID를 id에 그대로 씁니다. 모든 요청 항목이 결과에 있어야 하며, 메모에 없는 항목은 unverified로 둡니다.
- status: 메모가 금액을 근거와 함께 확인했으면 confirmed, 무료가 확실하다고 했으면 free, '확인 못함'이거나 근거가 없으면 unverified.
- confirmed: localCurrency는 요금의 통화(ISO 4217 3글자 대문자), localAmount는 외국인 성인 1인 금액(숫자). free나 unverified이면 localAmount는 0이고, localCurrency는 비워도 됩니다.
- sourceName은 메모에 적힌 확인 사이트 이름(없으면 빈 문자열), note는 유의사항 한 줄(없으면 빈 문자열)입니다.
- recommendedStayMinutes는 메모에서 확인한 통상적인 체류·관람 시간을 분 단위 숫자로 씁니다("약 1~2시간"이면 중간값). 메모에 없거나 '확인 못함'이면 0입니다.
- 한국어로 작성하고, 지정된 JSON 스키마의 JSON만 출력합니다.`;

const resultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("요청한 항목 ID"),
      status: z.enum(["confirmed", "free", "unverified"]).describe("확인 상태"),
      localCurrency: z.string().describe("요금 통화 ISO 4217 3글자. free/unverified면 빈 문자열 가능"),
      localAmount: z.number().describe("현지 통화 기준 외국인 성인 1인 금액. free/unverified면 0"),
      sourceName: z.string().describe("요금을 확인한 사이트 이름. 없으면 빈 문자열"),
      note: z.string().describe("유의사항 한 줄. 없으면 빈 문자열"),
      recommendedStayMinutes: z.number().describe("통상적인 체류·관람 시간(분). 확인 못했으면 0"),
    }),
  ),
});

/** 통화별로 자연스러운 자릿수로 반올림 (원화는 100원 단위, 바트·엔·동은 정수, 그 외는 소수 둘째 자리) */
function roundFor(currency: string, value: number): number {
  if (currency === "KRW") return Math.round(value / 100) * 100;
  if (["JPY", "VND", "THB"].includes(currency)) return Math.round(value);
  return Math.round(value * 100) / 100;
}

/** 일정 항목의 입장료·체험료를 웹 검색으로 확인하고, 견적 통화로 환산한 금액까지 돌려준다. */
export async function verifyFees(req: VerifyFeesRequest): Promise<VerifyFeesResponse> {
  // 1단계: 검색으로 조사, 2단계: 조사 메모를 JSON으로 정리
  const research = await generateGroundedText({ user: researchPrompt(req) });
  const structured = await generateJson({
    system: SYSTEM,
    user: [
      "<research_memo>",
      research.text,
      "</research_memo>",
      "",
      `요청 항목 ID: ${req.items.map((i) => i.id).join(", ")}`,
      "",
      "위 메모를 스키마에 맞게 정리해 주세요.",
    ].join("\n"),
    schema: resultSchema,
    temperature: 0,
  });

  const byId = new Map(structured.results.map((r) => [r.id, r]));
  const currencies = new Set<string>();
  const drafts = req.items.map((item) => {
    const raw = byId.get(item.id);
    const currency = raw?.localCurrency.trim().toUpperCase() ?? "";
    const validCurrency = /^[A-Z]{3}$/.test(currency);
    // 검색 근거가 없으면 금액을 믿을 수 없다. confirmed는 유효한 금액과 통화가 있어야 한다.
    let status: FeeCheckResult["status"] = !research.searched || !raw ? "unverified" : raw.status;
    if (status === "confirmed" && !(validCurrency && Number.isFinite(raw?.localAmount) && (raw?.localAmount ?? 0) > 0)) status = "unverified";
    if (status === "confirmed") currencies.add(currency);
    return { item, raw, currency, status };
  });

  // 환산: 현지 통화 → 원 → 견적 통화
  const rates = new Map<string, { rate: number; updatedAt: string }>();
  const wanted = new Set([...currencies].filter((c) => c !== req.currency));
  if (req.currency !== "KRW" && !(req.exchangeRateToKrw > 0) && wanted.size > 0) wanted.add(req.currency);
  await Promise.all(
    [...wanted].map(async (code) => {
      const found = await krwPerUnit(code);
      if (found) rates.set(code, found);
    }),
  );
  const krwPerQuote = req.currency === "KRW" ? 1 : req.exchangeRateToKrw > 0 ? req.exchangeRateToKrw : (rates.get(req.currency)?.rate ?? 0);

  const results: FeeCheckResult[] = drafts.map(({ raw, item, currency, status }) => {
    const note = !research.searched ? "웹 검색 근거를 확보하지 못해 확인하지 못했습니다." : (raw?.note.trim() ?? "");
    // 검색 근거가 없으면 체류 시간도 믿을 수 없으므로 0(확인 못함)으로 둔다
    const recommendedStayMinutes = research.searched && raw ? Math.max(0, Math.round(raw.recommendedStayMinutes)) : 0;
    if (status === "unverified") {
      return { id: item.id, status, localCurrency: "", localAmount: 0, amountInQuote: null, sourceName: "", note: note || "웹에서 확인하지 못했습니다.", recommendedStayMinutes };
    }
    if (status === "free") {
      return { id: item.id, status, localCurrency: currency, localAmount: 0, amountInQuote: 0, sourceName: raw?.sourceName.trim() ?? "", note, recommendedStayMinutes };
    }
    const localAmount = raw?.localAmount ?? 0;
    let amountInQuote: number | null = null;
    if (currency === req.currency) {
      amountInQuote = roundFor(req.currency, localAmount);
    } else {
      const perLocal = rates.get(currency)?.rate;
      if (perLocal && krwPerQuote > 0) amountInQuote = roundFor(req.currency, (localAmount * perLocal) / krwPerQuote);
    }
    return { id: item.id, status, localCurrency: currency, localAmount, amountInQuote, sourceName: raw?.sourceName.trim() ?? "", note, recommendedStayMinutes };
  });

  return {
    results,
    sources: research.sources.slice(0, 8),
    searched: research.searched,
    checkedAt: new Date().toISOString(),
    fx: [...rates].map(([currency, v]) => ({ currency, krwPerUnit: v.rate, updatedAt: v.updatedAt })),
  };
}
