"use client";

import { AlertTriangle, Calculator, FileSignature, FileText, Printer, Receipt } from "lucide-react";
import { DOC_LABELS, type DocKind } from "@/components/print/PrintDocuments";

interface Props {
  disabled: boolean;
  /** 아직 비어 있는 법정 표시 항목 (회사 설정에서 채운다) */
  missingLegal: string[];
  onPrint: (kind: DocKind) => void;
}

const BUTTONS: { kind: DocKind; icon: typeof FileText; description: string }[] = [
  { kind: "itinerary", icon: FileText, description: "일정·포함 사항·취소 규정" },
  { kind: "quote", icon: Printer, description: "요금·결제 조건" },
  { kind: "invoice", icon: Receipt, description: "청구 내역·입금 안내" },
  { kind: "contract", icon: FileSignature, description: "국외여행 표준약관 전문 첨부, 서명란 포함" },
];

const INTERNAL: { kind: DocKind; icon: typeof FileText; description: string } = {
  kind: "internal",
  icon: Calculator,
  description: "원가·마진·경쟁사 분석 (고객 전달 금지)",
};

/** 고객용 문서를 브라우저 인쇄로 PDF 저장한다 */
export function DocumentBar({ disabled, missingLegal, onPrint }: Props) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div>
        <p className="text-xs font-medium text-slate-800">문서 인쇄 (PDF)</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          버튼을 누르면 인쇄 창이 열립니다. 인쇄 대상에서 <span className="font-medium">&quot;PDF로 저장&quot;</span>을 고르면 파일로 저장됩니다. 고객용
        문서에는 차량비·가이드비·식대 같은 원가 내역이 들어가지 않습니다.
        </p>
      </div>

      {missingLegal.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          법정 표시 항목이 비어 있습니다: {missingLegal.join(", ")}. 화면 위 &quot;회사 설정&quot;에서 입력하면 문서에 함께 인쇄됩니다.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-slate-500">고객용</span>
        {BUTTONS.map(({ kind, icon: Icon, description }) => (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            onClick={() => onPrint(kind)}
            title={description}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon className="h-4 w-4 text-slate-400" aria-hidden />
            {DOC_LABELS[kind]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
        <span className="text-[11px] font-medium text-slate-500">내부용</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPrint(INTERNAL.kind)}
          title={INTERNAL.description}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <INTERNAL.icon className="h-4 w-4" aria-hidden />
          원가·마진 검토서
        </button>
        <span className="text-[11px] text-slate-500">원가·마진이 들어 있어 고객에게 전달하면 안 됩니다.</span>
      </div>

      <p className="text-[10px] leading-4 text-slate-400">
        문서에 들어가는 법정 표시 항목과 취소 규정은 공개된 법령·표준약관을 참고해 정리한 것입니다. 실제 판매 전에 협회나 담당 관청에 확인하세요.
      </p>
    </section>
  );
}
