import type { CompanyProfile } from "@/types";

export const DEFAULT_COMPANY: CompanyProfile = {
  name: "",
  registrationNumber: "",
  registrationAuthority: "",
  businessNumber: "",
  ceo: "",
  address: "",
  phone: "",
  email: "",
  insurance: "",
  travelerInsurance: "",
  depositRate: 10,
  bankAccount: "",
  emergencyContact: "",
};

/** 저장된 값을 현재 형태로 맞춘다. 없는 키는 기본값으로 채운다. */
export function normalizeCompany(saved: unknown): CompanyProfile {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return DEFAULT_COMPANY;
  const s = saved as Partial<CompanyProfile>;
  const text = (v: unknown, fallback: string) => (typeof v === "string" ? v.slice(0, 300) : fallback);
  const rate = Number(s.depositRate);
  return {
    name: text(s.name, ""),
    registrationNumber: text(s.registrationNumber, ""),
    registrationAuthority: text(s.registrationAuthority, ""),
    businessNumber: text(s.businessNumber, ""),
    ceo: text(s.ceo, ""),
    address: text(s.address, ""),
    phone: text(s.phone, ""),
    email: text(s.email, ""),
    insurance: text(s.insurance, ""),
    travelerInsurance: text(s.travelerInsurance, ""),
    // 표준약관상 계약금은 여행요금의 10%를 넘을 수 없다
    depositRate: Number.isFinite(rate) ? Math.min(10, Math.max(0, rate)) : DEFAULT_COMPANY.depositRate,
    bankAccount: text(s.bankAccount, ""),
    emergencyContact: text(s.emergencyContact, ""),
  };
}

/** 관광진흥법 시행규칙 §21이 기획여행 안내에 표시하도록 정한 항목 중, 회사 정보에서 채워야 하는 것 */
const LEGAL_FIELDS: { key: keyof CompanyProfile; label: string }[] = [
  { key: "name", label: "상호" },
  { key: "registrationNumber", label: "여행업 등록번호" },
  { key: "registrationAuthority", label: "등록관청" },
  { key: "address", label: "소재지" },
  { key: "insurance", label: "보증보험·공제 가입 내용" },
];

/** 아직 비어 있는 법정 표시 항목의 이름들 */
export function missingLegalFields(company: CompanyProfile): string[] {
  return LEGAL_FIELDS.filter(({ key }) => String(company[key]).trim() === "").map(({ label }) => label);
}

export function isCompanyReady(company: CompanyProfile): boolean {
  return missingLegalFields(company).length === 0;
}

/** 문서 하단에 넣는 회사 표시 줄들 (빈 항목은 넣지 않는다) */
export function companyLines(company: CompanyProfile): string[] {
  const head = [company.name, company.ceo ? `대표 ${company.ceo}` : ""].filter(Boolean).join(" · ");
  const registration = [
    company.registrationNumber ? `여행업 등록번호 ${company.registrationNumber}` : "",
    company.registrationAuthority ? `등록관청 ${company.registrationAuthority}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const contact = [company.address, company.phone, company.email].filter(Boolean).join(" · ");
  return [head, registration, contact, company.insurance, company.businessNumber ? `사업자등록번호 ${company.businessNumber}` : ""].filter(Boolean);
}
