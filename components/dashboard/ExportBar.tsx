"use client";

import { useHideCosts } from "@/components/SessionContext";
import { CopyButton } from "./CopyButton";

interface Props {
  disabled: boolean;
  getInternalText: () => string;
  getCustomerText: () => string;
  /** 업체 코스표 스타일(이모지·번호·화살표) 고객용 */
  getEmojiText: () => string;
  /** 판매 채널 등록용 상품 정보 (항목별 글, CSV) */
  getListingText?: () => string;
  getListingCsv?: () => string;
}

export function ExportBar({ disabled, getInternalText, getCustomerText, getEmojiText, getListingText, getListingCsv }: Props) {
  const hideCosts = useHideCosts();
  const downloadCsv = () => {
    if (!getListingCsv) return;
    const url = URL.createObjectURL(new Blob([getListingCsv()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "상품등록.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="max-w-md">
        <p className="text-xs font-medium text-slate-800">텍스트로 복사</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          <span className="font-medium">내부용</span>은 원가·마진·경쟁사 비교·USP를 포함하고,{" "}
          <span className="font-medium">고객용</span>은 일정·판매가·포함/불포함만 담아 그대로 전달할 수 있습니다. <span className="font-medium">이모지 고객용</span>은 같은 내용을 업체 코스표처럼 이모지·번호·화살표로 꾸민 버전입니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!hideCosts && <CopyButton label="내부용 복사" variant="secondary" disabled={disabled} getText={getInternalText} />}
        <CopyButton label="이모지 고객용 복사" variant="secondary" disabled={disabled} getText={getEmojiText} />
        <CopyButton label="고객용 복사" variant="primary" disabled={disabled} getText={getCustomerText} />
      </div>
      {getListingText && (
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
          <span className="text-[11px] font-medium text-slate-500">판매 채널 등록</span>
          <CopyButton label="상품 정보 복사 (항목별)" variant="secondary" disabled={disabled} getText={getListingText} />
          <button
            type="button"
            disabled={disabled}
            onClick={downloadCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            CSV 받기
          </button>
          <span className="text-[11px] text-slate-500">마이리얼트립·스마트스토어 등 등록 화면에 상품명·특징·일정·포함/불포함·유의사항·태그를 붙여 넣습니다 (원가·업체 정보 없음).</span>
        </div>
      )}
    </div>
  );
}
