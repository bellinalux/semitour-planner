import { z } from "zod";
import type { SuggestOptionsRequest, SuggestOptionsResponse } from "@/lib/schemas/optionSuggest";
import { krwPerUnit } from "./fx";
import { generateGroundedText, generateJson } from "./gemini";
import { buildOptionSuggestResearchPrompt, buildOptionSuggestStructurePrompt, OPTION_SUGGEST_STRUCTURE_SYSTEM_PROMPT } from "./optionSuggestPrompt";

const optionSchema = z.object({
  name: z.string().describe("옵션 이름 (예: 바나나보트, 제트스키, 수상택시)"),
  description: z.string().describe("무엇을 하는지 1문장"),
  status: z.enum(["confirmed", "unverified"]).describe("요금 확인 상태"),
  localCurrency: z.string().describe("요금 통화 ISO 4217 3글자. unverified면 빈 문자열 가능"),
  localAmount: z.number().describe("현지 통화 기준 외국인 성인 1인 요금. unverified면 0"),
  sourceName: z.string().describe("확인한 사이트·업체 이름. 없으면 빈 문자열"),
  note: z.string().describe("예약 필요 여부 등 유의사항 한 줄. 없으면 빈 문자열"),
});

const resultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("요청한 코스 ID"),
      options: z.array(optionSchema).max(3).describe("그 코스에 어울리는 선택 옵션. 없으면 빈 배열"),
    }),
  ),
});

/** 통화별로 자연스러운 자릿수로 반올림 (원화는 100원 단위, 바트·엔·동은 정수, 그 외는 소수 둘째 자리) */
function roundFor(currency: string, value: number): number {
  if (currency === "KRW") return Math.round(value / 100) * 100;
  if (["JPY", "VND", "THB"].includes(currency)) return Math.round(value);
  return Math.round(value * 100) / 100;
}

/** 일정의 코스마다 팔 만한 선택 옵션을 웹 검색으로 찾고, 견적 통화로 환산한 금액까지 돌려준다. */
export async function suggestOptions(req: SuggestOptionsRequest): Promise<SuggestOptionsResponse> {
  // 1단계: 검색으로 조사, 2단계: 조사 메모를 JSON으로 정리
  const research = await generateGroundedText({ user: buildOptionSuggestResearchPrompt(req) });
  const structured = await generateJson({
    system: OPTION_SUGGEST_STRUCTURE_SYSTEM_PROMPT,
    user: buildOptionSuggestStructurePrompt(req, research.text),
    schema: resultSchema,
    temperature: 0.2,
  });

  const byId = new Map(structured.results.map((r) => [r.id, r]));

  type Draft = { raw: z.infer<typeof optionSchema>; currency: string; status: "confirmed" | "unverified" };
  const draftsById = new Map<string, Draft[]>();
  const currencies = new Set<string>();

  for (const item of req.items) {
    const raw = byId.get(item.id);
    const drafts: Draft[] = (raw?.options ?? []).slice(0, 3).map((o) => {
      const currency = o.localCurrency.trim().toUpperCase();
      const validCurrency = /^[A-Z]{3}$/.test(currency);
      // 검색 근거가 없으면 금액을 믿을 수 없다. confirmed는 유효한 금액과 통화가 있어야 한다.
      let status: "confirmed" | "unverified" = !research.searched ? "unverified" : o.status;
      if (status === "confirmed" && !(validCurrency && Number.isFinite(o.localAmount) && o.localAmount > 0)) status = "unverified";
      if (status === "confirmed") currencies.add(currency);
      return { raw: o, currency, status };
    });
    draftsById.set(item.id, drafts);
  }

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

  const results = req.items.map((item) => {
    const drafts = draftsById.get(item.id) ?? [];
    const options = drafts.map(({ raw, currency, status }) => {
      const note = !research.searched ? "웹 검색 근거를 확보하지 못해 확인하지 못했습니다." : (raw.note.trim() ?? "");
      if (status === "unverified") {
        return {
          name: raw.name.trim(),
          description: raw.description.trim(),
          status,
          localCurrency: "",
          localAmount: 0,
          amountInQuote: null,
          sourceName: "",
          note: note || "웹에서 확인하지 못했습니다.",
        };
      }
      const localAmount = raw.localAmount;
      let amountInQuote: number | null = null;
      if (currency === req.currency) {
        amountInQuote = roundFor(req.currency, localAmount);
      } else {
        const perLocal = rates.get(currency)?.rate;
        if (perLocal && krwPerQuote > 0) amountInQuote = roundFor(req.currency, (localAmount * perLocal) / krwPerQuote);
      }
      return {
        name: raw.name.trim(),
        description: raw.description.trim(),
        status,
        localCurrency: currency,
        localAmount,
        amountInQuote,
        sourceName: raw.sourceName.trim(),
        note,
      };
    });
    return { id: item.id, options };
  });

  return {
    results,
    sources: research.sources.slice(0, 8),
    searched: research.searched,
    checkedAt: new Date().toISOString(),
    fx: [...rates].map(([currency, v]) => ({ currency, krwPerUnit: v.rate, updatedAt: v.updatedAt })),
  };
}
