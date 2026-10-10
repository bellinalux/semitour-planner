"use client";

import { ContractDoc } from "./ContractDoc";
import { InternalQuoteDoc } from "./InternalQuoteDoc";
import { InvoiceDoc } from "./InvoiceDoc";
import { ItineraryDoc } from "./ItineraryDoc";
import { OperationDoc } from "./OperationDoc";
import { OptionsDoc } from "./OptionsDoc";
import { PitchDoc } from "./PitchDoc";
import { QuoteDoc } from "./QuoteDoc";
import type { DocProps } from "./DocShell";

/** 인쇄할 수 있는 문서 종류 */
export type DocKind = "itinerary" | "quote" | "invoice" | "contract" | "internal" | "operation" | "pitch" | "options";

export const DOC_LABELS: Record<DocKind, string> = {
  itinerary: "여행일정표",
  quote: "견적서",
  invoice: "청구서",
  contract: "여행계약서",
  internal: "원가·마진 검토서 (내부용)",
  operation: "운영 지시서 (가이드·기사용)",
  pitch: "상품 소개서",
  options: "비교 견적서 (A/B/C안·인원별)",
};

interface Props {
  kind: DocKind | null;
  data: DocProps | null;
}

/**
 * 화면에는 보이지 않고 인쇄할 때만 나오는 문서 영역.
 * 인쇄 버튼을 누르면 kind가 정해지고, 그 문서만 그려서 브라우저 인쇄로 넘긴다.
 */
export function PrintDocuments({ kind, data }: Props) {
  if (!kind || !data) return null;

  return (
    <div className="print-root" aria-hidden>
      {kind === "itinerary" && <ItineraryDoc {...data} />}
      {kind === "quote" && <QuoteDoc {...data} />}
      {kind === "invoice" && <InvoiceDoc {...data} />}
      {kind === "contract" && <ContractDoc {...data} />}
      {kind === "internal" && <InternalQuoteDoc {...data} />}
      {kind === "operation" && <OperationDoc {...data} />}
      {kind === "pitch" && <PitchDoc {...data} />}
      {kind === "options" && <OptionsDoc {...data} />}
    </div>
  );
}
