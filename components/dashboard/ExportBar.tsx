import { CopyButton } from "./CopyButton";

interface Props {
  disabled: boolean;
  getInternalText: () => string;
  getCustomerText: () => string;
}

export function ExportBar({ disabled, getInternalText, getCustomerText }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="max-w-md">
        <p className="text-xs font-medium text-slate-800">텍스트로 복사</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          <span className="font-medium">내부용</span>은 원가·마진·경쟁사 비교·USP를 포함하고,{" "}
          <span className="font-medium">고객용</span>은 일정·판매가·포함/불포함만 담아 그대로 전달할 수 있습니다.
        </p>
      </div>
      <div className="flex gap-2">
        <CopyButton label="내부용 복사" variant="secondary" disabled={disabled} getText={getInternalText} />
        <CopyButton label="고객용 복사" variant="primary" disabled={disabled} getText={getCustomerText} />
      </div>
    </div>
  );
}
