"use client";

import { AlertTriangle, Bus, Calculator, Columns3, Languages, FileSignature, FileText, Printer, Receipt, Sparkles } from "lucide-react";
import { useState } from "react";
import { useHideCosts } from "@/components/SessionContext";
import { DOC_LABELS, type DocKind } from "@/components/print/PrintDocuments";

interface Props {
  disabled: boolean;
  /** 아직 비어 있는 법정 표시 항목 (회사 설정에서 채운다) */
  missingLegal: string[];
  /** 고객 문서 인쇄 전에 확인할 값 (직접 확인하지 않은 추정 원가 등). 있으면 인쇄 전에 한 번 묻는다 */
  unconfirmed: string[];
  onPrint: (kind: DocKind) => void;
}

const BUTTONS: { kind: DocKind; icon: typeof FileText; description: string }[] = [
  { kind: "pitch", icon: Sparkles, description: "이 상품을 추천하는 이유·포함 사항·하이라이트·고를 때 확인할 점 (경쟁사 이름·원가 없음)" },
  { kind: "itinerary", icon: FileText, description: "일정·포함 사항·취소 규정" },
  { kind: "quote", icon: Printer, description: "요금·결제 조건" },
  { kind: "options", icon: Columns3, description: "숙소 등급만 다른 A/B/C안과 인원별(출발 요일별) 1인 요금표 — 상담·브로셔용" },
  { kind: "invoice", icon: Receipt, description: "청구 내역·입금 안내" },
  { kind: "english", icon: Languages, description: "외국인 고객용 영어 일정표·요금 (일정 이름·설명을 AI로 번역해 인쇄)" },
  { kind: "contract", icon: FileSignature, description: "국외여행 표준약관 전문 첨부, 서명란 포함" },
];

const INTERNAL: { kind: DocKind; icon: typeof FileText; description: string } = {
  kind: "internal",
  icon: Calculator,
  description: "원가·마진·경쟁사 분석 (고객 전달 금지)",
};

/** 고객용 문서를 브라우저 인쇄로 PDF 저장한다 */
export function DocumentBar({ disabled, missingLegal, unconfirmed, onPrint }: Props) {
  const [pending, setPending] = useState<DocKind | null>(null);
  const hideCosts = useHideCosts();
  const [checked, setChecked] = useState(false);
  const askOrPrint = (kind: DocKind) => {
    if (unconfirmed.length === 0) return onPrint(kind);
    setChecked(false);
    setPending(kind);
  };

  return (
    <section id="documents" className="scroll-mt-4 space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
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
            onClick={() => askOrPrint(kind)}
            title={description}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon className="h-4 w-4 text-slate-400" aria-hidden />
            {DOC_LABELS[kind]}
          </button>
        ))}
      </div>

      {pending && (
        <div role="alertdialog" aria-label="인쇄 전 확인" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] leading-4 text-amber-900">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {DOC_LABELS[pending]} 인쇄 전 확인 — 판매가에 들어간 값 중 직접 확인하지 않은 것이 있습니다
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {unconfirmed.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          <label className="flex items-center gap-1.5 font-medium">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            위 값을 확인했고, 이 금액으로 고객에게 안내해도 됩니다
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!checked}
              onClick={() => {
                onPrint(pending);
                setPending(null);
              }}
              className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              인쇄
            </button>
            <button type="button" onClick={() => setPending(null)} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium">
              취소
            </button>
          </div>
        </div>
      )}

      {!hideCosts && (
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
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-slate-500">현지용</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPrint("operation")}
          title="날짜별 시각표·차량 하차/픽업·식사 예약·입장권·주의사항·운전 휴게 (판매가·원가 없음)"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Bus className="h-4 w-4 text-slate-400" aria-hidden />
          운영 지시서
        </button>
        <span className="text-[11px] text-slate-500">가이드·기사·랜드사에 넘기는 현장용 (가격 없음)</span>
      </div>

      <p className="text-[10px] leading-4 text-slate-400">
        문서에 들어가는 법정 표시 항목과 취소 규정은 공개된 법령·표준약관을 참고해 정리한 것입니다. 실제 판매 전에 협회나 담당 관청에 확인하세요.
      </p>
    </section>
  );
}
