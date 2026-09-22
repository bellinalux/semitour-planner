import { CopyButton } from "./CopyButton";

interface Props {
  disabled: boolean;
  getInternalText: () => string;
  getCustomerText: () => string;
  /** 업체 코스표 스타일(이모지·번호·화살표) 고객용 */
  getEmojiText: () => string;
}

export function ExportBar({ disabled, getInternalText, getCustomerText, getEmojiText }: Props) {
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
        <CopyButton label="내부용 복사" variant="secondary" disabled={disabled} getText={getInternalText} />
        <CopyButton label="이모지 고객용 복사" variant="secondary" disabled={disabled} getText={getEmojiText} />
        <CopyButton label="고객용 복사" variant="primary" disabled={disabled} getText={getCustomerText} />
      </div>
    </div>
  );
}
