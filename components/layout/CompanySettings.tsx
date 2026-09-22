"use client";

import { AlertTriangle, Building2, Check, Cloud, HardDrive, Loader2, Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { missingLegalFields } from "@/lib/company";
import type { CompanyProfile } from "@/types";

type FieldKey = Exclude<keyof CompanyProfile, "depositRate">;

interface FieldSpec {
  key: FieldKey;
  label: string;
  hint?: string;
  placeholder?: string;
  /** 관광진흥법 시행규칙 §21이 정한 법정 표시 항목 */
  legal?: boolean;
  wide?: boolean;
  multiline?: boolean;
}

const SECTIONS: { title: string; description: string; fields: FieldSpec[] }[] = [
  {
    title: "법정 표시 항목",
    description: "관광진흥법 시행규칙 제21조가 기획여행 안내에 표시하도록 정한 항목입니다. 고객용 문서 아래에 들어갑니다.",
    fields: [
      { key: "name", label: "상호", legal: true, placeholder: "예) 스케치북트래블" },
      { key: "registrationNumber", label: "여행업 등록번호", legal: true, placeholder: "예) 제2019-3호" },
      { key: "registrationAuthority", label: "등록관청", legal: true, placeholder: "예) 서울특별시 서초구청" },
      { key: "address", label: "소재지", legal: true, wide: true, placeholder: "예) 서울특별시 서초구 강남대로 311" },
      {
        key: "insurance",
        label: "보증보험·공제 가입 또는 영업보증금 내용",
        legal: true,
        wide: true,
        multiline: true,
        placeholder: "예) 영업보증보험 1억원 가입 (한국여행업협회 공제)",
        hint: "가입한 보험 종류와 보장 금액을 그대로 적으세요.",
      },
    ],
  },
  {
    title: "회사 정보",
    description: "견적서·청구서 아래와 문의 연락처로 쓰입니다.",
    fields: [
      { key: "ceo", label: "대표자" },
      { key: "businessNumber", label: "사업자등록번호", placeholder: "예) 209-81-55339" },
      { key: "phone", label: "대표 전화" },
      { key: "email", label: "이메일" },
      { key: "bankAccount", label: "입금 계좌", wide: true, placeholder: "예) 국민은행 123-456-789012 (예금주: ○○○)" },
      { key: "emergencyContact", label: "현지·긴급 비상연락처", wide: true, placeholder: "예) 현지 인솔자 010-0000-0000 / 24시간 +66-0-000-0000" },
      {
        key: "travelerInsurance",
        label: "여행자보험 안내",
        wide: true,
        multiline: true,
        placeholder: "예) 여행자보험 가입 (상해사망 1억원 한도, 만 15세 미만·만 80세 이상 보장 제한)",
        hint: "고객용 문서의 유의사항에 그대로 표시됩니다.",
      },
    ],
  },
];

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

export function CompanySettings() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { company, storage, save } = useCompanyProfile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CompanyProfile>(company);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const missing = missingLegalFields(company);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const openDialog = () => {
    setDraft(company);
    setNotice(null);
    setOpen(true);
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    const error = await save(draft);
    setBusy(false);
    setNotice(
      error
        ? { kind: "error", text: error }
        : { kind: "ok", text: storage === "cloud" ? "저장했습니다. 다른 기기에서도 같은 값이 쓰입니다." : "이 브라우저에 저장했습니다." },
    );
  };

  const set = (key: FieldKey, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Building2 className="h-3.5 w-3.5" aria-hidden />
        <span>회사 설정</span>
        {missing.length > 0 && (
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={`법정 표시 항목이 비어 있습니다: ${missing.join(", ")}`} aria-label="법정 표시 항목 미입력" />
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="company-settings-title"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 id="company-settings-title" className="text-sm font-semibold text-slate-900">
                회사 설정
              </h2>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                {storage === "loading" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    불러오는 중...
                  </>
                ) : storage === "cloud" ? (
                  <>
                    <Cloud className="h-3 w-3" aria-hidden />
                    서버에 저장됩니다 (모든 기기 공용)
                  </>
                ) : (
                  <>
                    <HardDrive className="h-3 w-3" aria-hidden />
                    이 브라우저에만 저장됩니다
                  </>
                )}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="space-y-5 overflow-y-auto p-4">
            {missing.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                아직 비어 있는 법정 표시 항목: {missing.join(", ")}. 비어 있으면 고객용 문서에 해당 줄이 빠집니다.
              </p>
            )}

            {SECTIONS.map((section) => (
              <section key={section.title} className="space-y-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-800">{section.title}</h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{section.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {section.fields.map((field) => (
                    <div key={field.key} className={field.wide ? "sm:col-span-2" : ""}>
                      <label htmlFor={`company-${field.key}`} className="mb-1 block text-[11px] font-medium text-slate-600">
                        {field.label}
                        {field.legal && <span className="ml-1 rounded bg-indigo-50 px-1 py-px text-[10px] font-semibold text-indigo-700">법정</span>}
                      </label>
                      {field.multiline ? (
                        <textarea
                          id={`company-${field.key}`}
                          rows={2}
                          value={draft[field.key]}
                          placeholder={field.placeholder}
                          onChange={(e) => set(field.key, e.target.value)}
                          className={`${inputClass} resize-y`}
                        />
                      ) : (
                        <input
                          id={`company-${field.key}`}
                          value={draft[field.key]}
                          placeholder={field.placeholder}
                          onChange={(e) => set(field.key, e.target.value)}
                          className={inputClass}
                        />
                      )}
                      {field.hint && <p className="mt-1 text-[11px] leading-4 text-slate-400">{field.hint}</p>}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <section className="space-y-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-800">거래 조건</h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">청구서의 계약금·잔금 계산에 쓰입니다.</p>
              </div>
              <div className="sm:w-48">
                <label htmlFor="company-depositRate" className="mb-1 block text-[11px] font-medium text-slate-600">
                  계약금 비율
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="company-depositRate"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={10}
                    step="any"
                    value={draft.depositRate}
                    onChange={(e) => setDraft((prev) => ({ ...prev, depositRate: Number(e.target.value) }))}
                    className={`${inputClass} text-right tabular-nums`}
                  />
                  <span className="text-xs text-slate-500">%</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">국외여행 표준약관상 계약금은 여행요금의 10%를 넘을 수 없습니다.</p>
              </div>
            </section>

            {notice && (
              <p
                role={notice.kind === "error" ? "alert" : "status"}
                className={`flex items-start gap-1.5 rounded-md px-2.5 py-2 text-[11px] leading-4 ${
                  notice.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {notice.kind === "error" ? <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> : <Check className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />}
                {notice.text}
              </p>
            )}

            <p className="text-[11px] leading-4 text-slate-400">
              이 내용은 고객용 문서에 그대로 인쇄됩니다. 법정 표시 항목은 공개된 법령을 참고해 정리한 것이므로, 실제 판매 전에 협회나 담당 관청에 확인하세요.
            </p>
          </div>

          <footer className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
            <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              닫기
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
              저장
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
