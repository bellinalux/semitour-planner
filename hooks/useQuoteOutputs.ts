"use client";

import { DOC_LABELS, type DocKind } from "@/components/print/PrintDocuments";
import { buildEmojiCustomerText } from "@/lib/exportEmoji";
import { buildCustomerText, buildInternalText } from "@/lib/exportText";
import type { PmChoice } from "@/lib/itinerary";
import { documentQuote } from "@/lib/pricing";
import { buildQuoteLogEntry, type QuoteLogAction } from "@/lib/quoteLog";
import type { CourseMeta, DayPlan, QuoteResult, TripInput, UspItem } from "@/types";
import type { QuoteLog } from "./useQuoteLog";

interface Args {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  meta: CourseMeta | null;
  quote: QuoteResult | null;
  usps: UspItem[];
  quoteLog: QuoteLog;
  /** 견적 이력에 남길 이름 (로그인한 사람, 없으면 직접 적은 이름) */
  author: string;
  print: (kind: DocKind) => void;
}

/**
 * 견적을 밖으로 내보내는 동작 — 문구 복사(내부용·고객용·이모지)와 문서 인쇄.
 * 고객에게 나가는 것은 선택한 판매 채널의 소비자가로 만들고, 견적 이력에 남긴다.
 */
export function useQuoteOutputs({ input, days, pmChoice, meta, quote, usps, quoteLog, author, print }: Args) {
  const exportData = () => {
    if (!quote?.ok) throw new Error("견적이 아직 준비되지 않았습니다.");
    return { input, days, pmChoice, quote, meta, usps };
  };
  const customerExportData = () => {
    const data = exportData();
    return { ...data, quote: documentQuote(data.quote, input) };
  };

  const logIssued = (action: QuoteLogAction, document: string) => {
    if (quote?.ok) quoteLog.record(buildQuoteLogEntry(input, documentQuote(quote, input), quote, action, document, author));
  };

  const exporter = {
    disabled: !quote?.ok,
    getInternalText: () => buildInternalText(exportData()),
    getCustomerText: () => {
      const text = buildCustomerText(customerExportData());
      logIssued("copy", "고객용 문구");
      return text;
    },
    getEmojiText: () => {
      const text = buildEmojiCustomerText(customerExportData());
      logIssued("copy", "이모지 고객용 문구");
      return text;
    },
  };

  const printDocument = (kind: DocKind) => {
    print(kind);
    if (kind !== "internal") logIssued("print", DOC_LABELS[kind]);
  };

  return { exporter, printDocument };
}
