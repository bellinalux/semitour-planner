"use client";

import { ClipboardCopy, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { supplierRequestText, supplierWorkbook, type RequestContext } from "@/lib/supplierRequest";

/** 업체 수정 요청서 — 목표 공급가·일정 조정·질문을 한 번에 정리한 문구(복사)와 검증 결과 엑셀 */
export function SupplierRequestBox({ ctx }: { ctx: RequestContext }) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const text = supplierRequestText(ctx);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ text: "복사했습니다. 카톡·메일에 붙여넣으세요.", error: false });
    } catch {
      setMessage({ text: "복사하지 못했습니다. 아래 글을 직접 선택해 복사해 주세요.", error: true });
    }
  };

  const download = async () => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      for (const sheet of supplierWorkbook(ctx)) {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
        ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 48 }];
        XLSX.utils.book_append_sheet(wb, ws, sheet.name);
      }
      const title = (ctx.meta?.packageName?.trim() || `${ctx.input.destination} ${ctx.input.nights}박${ctx.input.days}일`).replace(/[\\/:*?"<>|]/g, " ").trim();
      XLSX.writeFile(wb, `${title} 업체견적검증 ${new Date().toISOString().slice(0, 10)}.xlsx`);
      setMessage(null);
    } catch {
      setMessage({ text: "엑셀 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", error: true });
    }
  };

  return (
    <section aria-label="업체 수정 요청서" className="space-y-2 rounded-lg border border-slate-200 p-3 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-semibold text-slate-700">업체 수정 요청서</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 font-semibold text-white hover:bg-indigo-700"
        >
          <ClipboardCopy className="size-3.5" aria-hidden />
          문구 복사
        </button>
        <button
          type="button"
          onClick={() => void download()}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          <FileSpreadsheet className="size-3.5" aria-hidden />
          검증표 엑셀
        </button>
      </div>
      <p className="text-pretty text-slate-500">
        요청 공급가, 위에서 고른 일정 조정, 확인할 질문을 묶었습니다(회사 수익·판매가는 넣지 않습니다). 일정 조정은 위 체크를 바꾸면 함께 바뀝니다. 검증표 엑셀은
        회사 수익이 들어 있는 내부용입니다.
      </p>
      <textarea
        readOnly
        aria-label="업체 수정 요청 문구"
        value={text}
        rows={Math.min(18, text.split("\n").length + 1)}
        className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-[11px] leading-5 text-slate-800"
      />
      {message && (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-red-600" : "text-emerald-700"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
