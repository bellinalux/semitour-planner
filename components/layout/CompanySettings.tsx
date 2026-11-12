"use client";

import { AlertTriangle, Building2, Check, Cloud, HardDrive, Loader2, Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/SessionContext";
import type { CompanyStorage } from "@/hooks/useCompanyProfile";
import { missingLegalFields } from "@/lib/company";
import { resizeImage } from "@/lib/imageResize";
import type { CompanyProfile, SpecialTermSettings } from "@/types";
import { contractTermRisks, riskOf, SPECIAL_TERMS, REGION_LABEL } from "@/lib/specialTerms";
import { CancelPolicyEditor } from "@/components/form/CancelPolicyEditor";

const EMPTY_HOLIDAYS: ReadonlySet<string> = new Set();

type FieldKey = Exclude<
  keyof CompanyProfile,
  "depositRate" | "balanceDueDaysBeforeDeparture" | "useInterimPayment" | "interimPaymentRate" | "interimPaymentDaysBeforeDeparture" | "docColor" | "logo" | "specialTerms" | "cancelPolicy"
>;

const DOC_COLORS = [
  { color: "", label: "초록 (기본)" },
  { color: "#1e3a8a", label: "남색" },
  { color: "#0e7490", label: "청록" },
  { color: "#be123c", label: "자주" },
  { color: "#b45309", label: "호박" },
  { color: "#334155", label: "먹색" },
];

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

interface Props {
  company: CompanyProfile;
  storage: CompanyStorage;
  save: (next: CompanyProfile) => Promise<string | null>;
}

export function CompanySettings({ company, storage, save }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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

  const { isAdmin } = useSession();
  const handleSave = async () => {
    if (busy || !isAdmin) return;
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
                {!isAdmin && <span className="ml-1 font-medium text-amber-700">· 관리자만 고칠 수 있습니다 (보기 전용)</span>}
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
                <h3 className="text-xs font-semibold text-slate-800">문서 디자인</h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">고객 문서(일정표·견적서·상품 소개서 등)의 강조색과 로고입니다. 고객 이름이 있으면 일정표 첫 장에 표지가 붙습니다.</p>
              </div>
              <div role="radiogroup" aria-label="문서 강조색" className="flex flex-wrap items-center gap-2">
                {DOC_COLORS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    role="radio"
                    aria-checked={draft.docColor === c.color}
                    disabled={!isAdmin}
                    onClick={() => setDraft((prev) => ({ ...prev, docColor: c.color }))}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${draft.docColor === c.color ? "border-slate-900 font-semibold" : "border-slate-300"}`}
                  >
                    <span className="size-3 rounded-full" style={{ background: c.color || "#059669" }} aria-hidden />
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL 미리보기 */}
                <img src={draft.logo || "/logo-mark.png"} alt="문서 로고" className="size-9 rounded border border-slate-200 object-contain" />
                <label className={`cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 ${isAdmin ? "hover:bg-slate-50" : "opacity-50"}`}>
                  로고 올리기
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!isAdmin}
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        const logo = await resizeImage(file, 200, "image/png");
                        if (logo.length > 40_000) throw new Error("로고가 너무 큽니다. 더 단순한 이미지로 올려 주세요.");
                        setDraft((prev) => ({ ...prev, logo }));
                      } catch (err) {
                        setNotice({ kind: "error", text: err instanceof Error ? err.message : "로고를 올리지 못했습니다." });
                      }
                    }}
                  />
                </label>
                {draft.logo && isAdmin && (
                  <button type="button" onClick={() => setDraft((prev) => ({ ...prev, logo: "" }))} className="text-slate-500 underline">
                    기본 로고로
                  </button>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-800">거래 조건</h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  견적서·청구서·계약서의 계약금·중도금·잔금 계산에 쓰입니다. 표준약관 기본값은 계약금 10%·잔금 출발 7일전이지만,
                  전세기·그룹 항공권처럼 여행사가 먼저 결제해야 하는 상품은 특약으로 더 앞당기는 경우가 많습니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="w-32">
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
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">표준약관상 10% 이하</p>
                </div>
                <div className="w-40">
                  <label htmlFor="company-balanceDueDays" className="mb-1 block text-[11px] font-medium text-slate-600">
                    잔금 납부 기한
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">출발</span>
                    <input
                      id="company-balanceDueDays"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={180}
                      step={1}
                      value={draft.balanceDueDaysBeforeDeparture}
                      onChange={(e) => setDraft((prev) => ({ ...prev, balanceDueDaysBeforeDeparture: Number(e.target.value) }))}
                      className={`${inputClass} w-16 text-right tabular-nums`}
                    />
                    <span className="text-xs text-slate-500">일 전</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">표준약관 기본값 7일</p>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.useInterimPayment}
                  onChange={(e) => setDraft((prev) => ({ ...prev, useInterimPayment: e.target.checked }))}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                중도금을 받습니다 (계약금·잔금 사이, 표준약관에는 없는 특약 항목)
              </label>

              {draft.useInterimPayment && (
                <div className="flex flex-wrap gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-2.5">
                  <div className="w-32">
                    <label htmlFor="company-interimRate" className="mb-1 block text-[11px] font-medium text-slate-600">
                      중도금 비율
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="company-interimRate"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={90}
                        step="any"
                        value={draft.interimPaymentRate}
                        onChange={(e) => setDraft((prev) => ({ ...prev, interimPaymentRate: Number(e.target.value) }))}
                        className={`${inputClass} text-right tabular-nums`}
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                  </div>
                  <div className="w-40">
                    <label htmlFor="company-interimDays" className="mb-1 block text-[11px] font-medium text-slate-600">
                      중도금 납부 기한
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">출발</span>
                      <input
                        id="company-interimDays"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={365}
                        step={1}
                        value={draft.interimPaymentDaysBeforeDeparture}
                        onChange={(e) => setDraft((prev) => ({ ...prev, interimPaymentDaysBeforeDeparture: Number(e.target.value) }))}
                        className={`${inputClass} w-16 text-right tabular-nums`}
                      />
                      <span className="text-xs text-slate-500">일 전</span>
                    </div>
                  </div>
                  <p className="w-full text-[11px] leading-4 text-slate-400">
                    잔금 기한보다 먼저(출발일에서 더 먼 날짜)여야 하며, 짧으면 자동으로 잔금 기한 다음날로 맞춰집니다.
                  </p>
                </div>
              )}

              {(draft.balanceDueDaysBeforeDeparture !== 7 || draft.useInterimPayment) && (
                <p className="text-[11px] leading-4 text-amber-700">
                  표준약관(계약금 10%이하·잔금 출발 7일전)과 다른 조건이라, 여행계약서에 특약(제6조) 고지 문구가 자동으로 추가됩니다.
                </p>
              )}
            </section>

            <section aria-label="취소 및 환불 규정 (회사 기본)" className="space-y-1.5">
              <h3 className="text-xs font-semibold text-slate-800">취소 및 환불 규정 (회사 기본)</h3>
              <p className="text-[11px] leading-4 text-slate-500">
                모든 상품의 일정표·견적서·계약서·웹 일정표에 들어갑니다. 상품마다 다르게 하려면 입력 화면 &quot;5. 고객·문서&quot;에서 바꿉니다. 특별약관(표준보다 높은 취소료)은 사유와 실제 손해 근거가 필요합니다.
              </p>
              <CancelPolicyEditor value={draft.cancelPolicy} onChange={(cancelPolicy) => setDraft((prev) => ({ ...prev, cancelPolicy }))} holidays={EMPTY_HOLIDAYS} />
            </section>

            <SpecialTermsSettingsSection value={draft.specialTerms} onChange={(specialTerms) => setDraft((prev) => ({ ...prev, specialTerms }))} />

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

/** 여행계약서 특약 — 금액·영업시간·회사 고유 특약·쓰지 않을 특약 (상품별 선택은 입력 화면 5. 고객·문서) */
function SpecialTermsSettingsSection({ value, onChange }: { value: SpecialTermSettings; onChange: (v: SpecialTermSettings) => void }) {
  const set = <K extends keyof SpecialTermSettings>(k: K, v: SpecialTermSettings[K]) => onChange({ ...value, [k]: v });
  const customRisks = value.custom
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ line: l, risk: riskOf(l) }))
    .filter((x) => x.risk);
  const amountRisks = contractTermRisks([], value);
  const field = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";
  return (
    <section aria-label="여행계약서 특약" className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-slate-800">여행계약서 특약 (표준약관 제6조)</h3>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          대형 여행사 약관에서 쓰는 특약을 공통·국가별로 준비해 두었습니다. 여행지에 맞는 특약이 계약서에 자동으로 추천되고, 상품마다 입력 화면 &quot;5. 고객·문서&quot;에서 켜고 끌 수 있습니다.
          특약은 표준약관보다 우선하지만 설명·별도 동의가 필요하고, 전부 면책·과중한 위약금은 무효가 될 수 있습니다.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-[11px] font-medium text-slate-600">
          항공권 발권 후 취소 수수료 (1인, 원)
          <input type="number" min={0} step={10000} value={value.airCancelFee} onChange={(e) => set("airCancelFee", Math.max(0, Number(e.target.value) || 0))} className={`${field} mt-1 text-right tabular-nums`} />
          <span className="mt-0.5 block font-normal text-slate-400">0이면 &quot;항공사 규정에 따른 실비&quot;</span>
        </label>
        <label className="text-[11px] font-medium text-slate-600">
          노쇼 위약금 (1인, 원)
          <input type="number" min={0} step={10000} value={value.noShowFee} onChange={(e) => set("noShowFee", Math.max(0, Number(e.target.value) || 0))} className={`${field} mt-1 text-right tabular-nums`} />
          <span className="mt-0.5 block font-normal text-slate-400">출발 24시간 이내 취소·무연락 불참. 0이면 넣지 않음</span>
        </label>
        <label className="text-[11px] font-medium text-slate-600">
          취소 접수 영업시간
          <input value={value.businessHours} placeholder="예) 평일 09:00~18:00" onChange={(e) => set("businessHours", e.target.value)} className={`${field} mt-1`} />
          <span className="mt-0.5 block font-normal text-slate-400">넣으면 &quot;영업일 기준 접수&quot; 특약을 추천</span>
        </label>
      </div>
      <label className="block text-[11px] font-medium text-slate-600">
        회사 고유 특약 (한 줄에 하나, 모든 계약서에 들어감)
        <textarea rows={3} value={value.custom} onChange={(e) => set("custom", e.target.value)} className={`${field} mt-1 resize-y`} />
      </label>
      {[...customRisks.map((x) => `"${x.line.slice(0, 30)}…": ${x.risk}`), ...amountRisks].map((r) => (
        <p key={r} role="alert" className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800">
          {r}
        </p>
      ))}
      <details className="text-[11px] text-slate-600">
        <summary className="cursor-pointer font-medium">준비된 특약 {SPECIAL_TERMS.length}개 — 회사에서 쓰지 않을 것 끄기</summary>
        <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
          {SPECIAL_TERMS.map((t) => (
            <li key={t.id}>
              <label className="flex items-start gap-1.5">
                <input
                  type="checkbox"
                  checked={!value.disabled.includes(t.id)}
                  onChange={(e) => set("disabled", e.target.checked ? value.disabled.filter((x) => x !== t.id) : [...value.disabled, t.id])}
                  className="mt-0.5"
                />
                <span>
                  {t.title}
                  {t.region && <span className="ml-1 text-slate-400">({REGION_LABEL[t.region]})</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
